import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { VideoCommentedEvent, CommentDeletedEvent } from './events/interaction.events';

@Injectable()
export class CommentService {
  private readonly logger = new Logger(CommentService.name);
  private readonly CACHE_TTL = 300; // 5 minutos

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Criar comentário
   */
  async createComment(
    userId: string,
    videoId: string,
    content: string,
    parentId?: string,
  ) {
    // Verificar se vídeo existe
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, commentsCount: true, userId: true },
    });

    if (!video) {
      throw new NotFoundException('Vídeo não encontrado');
    }

    // Se for resposta, verificar se comentário pai existe
    if (parentId) {
      const parentComment = await this.prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, videoId: true },
      });

      if (!parentComment || parentComment.videoId !== videoId) {
        throw new NotFoundException('Comentário pai não encontrado');
      }
    }

    // Criar comentário e atualizar contador em transação
    const [comment, updatedVideo] = await this.prisma.$transaction([
      this.prisma.comment.create({
        data: {
          userId,
          videoId,
          content,
          parentId,
        },
        include: {
          user: {
            select: {
              id: true,
              profile: {
                select: {
                  displayName: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.video.update({
        where: { id: videoId },
        data: {
          commentsCount: {
            increment: 1,
          },
        },
      }),
    ]);

    // Invalidar cache
    await this.invalidateCommentsCache(videoId);

    // Emitir evento
    const event: VideoCommentedEvent = {
      commentId: comment.id,
      videoId,
      userId,
      content,
      parentId,
      commentedAt: new Date(),
      commentsCount: updatedVideo.commentsCount,
    };
    this.eventEmitter.emit('video.commented', event);

    this.logger.log(`Comentário criado: ${comment.id} no vídeo ${videoId}`);

    return {
      id: comment.id,
      content: comment.content,
      author: {
        id: comment.user.id,
        name: comment.user.profile?.displayName || null,
        avatarUrl: comment.user.profile?.avatarUrl || null,
      },
      createdAt: comment.createdAt,
      parentId: comment.parentId,
      likesCount: 0,
      repliesCount: 0,
    };
  }

  /**
   * Obter comentários de um vídeo
   */
  async getVideoComments(
    videoId: string,
    options: { cursor?: string; limit?: number; sort?: 'newest' | 'top' } = {},
  ) {
    const cacheKey = `comments:${videoId}:${options.cursor || 'first'}:${options.sort || 'newest'}`;
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const limit = options.limit || 20;
    const sort = options.sort || 'newest';

    // Buscar apenas comentários principais (não respostas)
    const comments = await this.prisma.comment.findMany({
      where: {
        videoId,
        parentId: null,
        deletedAt: null,
      },
      orderBy: sort === 'top' 
        ? [{ likesCount: 'desc' }, { createdAt: 'desc' }]
        : { createdAt: 'desc' },
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      include: {
        user: {
          select: {
            id: true,
            profile: {
              select: {
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            replies: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    const hasMore = comments.length > limit;
    const items = comments.slice(0, limit);

    const result = {
      data: items.map((comment) => ({
        id: comment.id,
        content: comment.content,
        author: {
          id: comment.user.id,
          name: comment.user.profile?.displayName || null,
          avatarUrl: comment.user.profile?.avatarUrl || null,
        },
        createdAt: comment.createdAt,
        likesCount: comment.likesCount || 0,
        repliesCount: comment._count.replies,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : undefined,
      hasMore,
      total: await this.prisma.comment.count({
        where: { videoId, parentId: null, deletedAt: null },
      }),
    };

    await this.redis.set(cacheKey, JSON.stringify(result), this.CACHE_TTL);

    return result;
  }

  /**
   * Obter respostas de um comentário
   */
  async getCommentReplies(
    commentId: string,
    options: { cursor?: string; limit?: number } = {},
  ) {
    const limit = options.limit || 10;

    const replies = await this.prisma.comment.findMany({
      where: {
        parentId: commentId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      include: {
        user: {
          select: {
            id: true,
            profile: {
              select: {
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    const hasMore = replies.length > limit;
    const items = replies.slice(0, limit);

    return {
      data: items.map((reply) => ({
        id: reply.id,
        content: reply.content,
        author: {
          id: reply.user.id,
          name: reply.user.profile?.displayName || null,
          avatarUrl: reply.user.profile?.avatarUrl || null,
        },
        createdAt: reply.createdAt,
        parentId: reply.parentId,
        likesCount: reply.likesCount || 0,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : undefined,
      hasMore,
    };
  }

  /**
   * Deletar comentário (soft delete)
   */
  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, videoId: true, content: true },
    });

    if (!comment) {
      throw new NotFoundException('Comentário não encontrado');
    }

    // Verificar permissão (apenas autor ou dono do vídeo pode deletar)
    const video = await this.prisma.video.findUnique({
      where: { id: comment.videoId },
      select: { userId: true },
    });

    if (comment.userId !== userId && video?.userId !== userId) {
      throw new ForbiddenException('Você não tem permissão para deletar este comentário');
    }

    // Soft delete e atualizar contador
    const [, updatedVideo] = await this.prisma.$transaction([
      this.prisma.comment.update({
        where: { id: commentId },
        data: {
          deletedAt: new Date(),
          content: '[Comentário removido]',
        },
      }),
      this.prisma.video.update({
        where: { id: comment.videoId },
        data: {
          commentsCount: {
            decrement: 1,
          },
        },
      }),
    ]);

    // Invalidar cache
    await this.invalidateCommentsCache(comment.videoId);

    // Emitir evento
    const event: CommentDeletedEvent = {
      commentId,
      videoId: comment.videoId,
      userId,
      deletedAt: new Date(),
      commentsCount: Math.max(0, updatedVideo.commentsCount),
    };
    this.eventEmitter.emit('comment.deleted', event);

    this.logger.log(`Comentário deletado: ${commentId}`);

    return { success: true };
  }

  private async invalidateCommentsCache(videoId: string): Promise<void> {
    const patterns = [
      `comments:${videoId}:*`,
      `video:${videoId}:*`,
    ];
    
    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
    }
  }
}
