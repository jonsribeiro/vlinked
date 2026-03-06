import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { VideoLikedEvent, VideoUnlikedEvent } from './events/interaction.events';

@Injectable()
export class LikeService {
  private readonly logger = new Logger(LikeService.name);
  private readonly CACHE_TTL = 300; // 5 minutos

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Curtir um vídeo
   */
  async likeVideo(userId: string, videoId: string): Promise<{ liked: boolean; likesCount: number }> {
    // Verificar se já curtiu
    const existingLike = await this.prisma.like.findUnique({
      where: {
        userId_videoId: {
          userId,
          videoId,
        },
      },
    });

    if (existingLike) {
      // Já curtiu, retornar estado atual
      const video = await this.prisma.video.findUnique({
        where: { id: videoId },
        select: { likesCount: true },
      });
      return { liked: true, likesCount: video?.likesCount || 0 };
    }

    // Criar like e atualizar contador em transação
    const [, video] = await this.prisma.$transaction([
      this.prisma.like.create({
        data: {
          userId,
          videoId,
        },
      }),
      this.prisma.video.update({
        where: { id: videoId },
        data: {
          likesCount: {
            increment: 1,
          },
        },
      }),
    ]);

    // Invalidar cache
    await this.invalidateVideoCache(videoId);

    // Emitir evento
    const event: VideoLikedEvent = {
      videoId,
      userId,
      likedAt: new Date(),
      likesCount: video.likesCount,
    };
    this.eventEmitter.emit('video.liked', event);

    this.logger.log(`Vídeo curtido: ${videoId} por usuário ${userId}`);

    return { liked: true, likesCount: video.likesCount };
  }

  /**
   * Descurtir um vídeo
   */
  async unlikeVideo(userId: string, videoId: string): Promise<{ liked: boolean; likesCount: number }> {
    // Verificar se existe like
    const existingLike = await this.prisma.like.findUnique({
      where: {
        userId_videoId: {
          userId,
          videoId,
        },
      },
    });

    if (!existingLike) {
      // Não curtiu, retornar estado atual
      const video = await this.prisma.video.findUnique({
        where: { id: videoId },
        select: { likesCount: true },
      });
      return { liked: false, likesCount: video?.likesCount || 0 };
    }

    // Remover like e atualizar contador em transação
    const [, video] = await this.prisma.$transaction([
      this.prisma.like.delete({
        where: {
          userId_videoId: {
            userId,
            videoId,
          },
        },
      }),
      this.prisma.video.update({
        where: { id: videoId },
        data: {
          likesCount: {
            decrement: 1,
          },
        },
      }),
    ]);

    // Invalidar cache
    await this.invalidateVideoCache(videoId);

    // Emitir evento
    const event: VideoUnlikedEvent = {
      videoId,
      userId,
      unlikedAt: new Date(),
      likesCount: Math.max(0, video.likesCount),
    };
    this.eventEmitter.emit('video.unliked', event);

    this.logger.log(`Vídeo descurtido: ${videoId} por usuário ${userId}`);

    return { liked: false, likesCount: Math.max(0, video.likesCount) };
  }

  /**
   * Verificar se usuário curtiu vídeo
   */
  async hasLiked(userId: string, videoId: string): Promise<boolean> {
    const cacheKey = `like:${userId}:${videoId}`;
    
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) {
      return cached === '1';
    }

    const like = await this.prisma.like.findUnique({
      where: {
        userId_videoId: {
          userId,
          videoId,
        },
      },
    });

    const hasLiked = !!like;
    await this.redis.set(cacheKey, hasLiked ? '1' : '0', this.CACHE_TTL);

    return hasLiked;
  }

  /**
   * Obter likes de um vídeo com paginação
   */
  async getVideoLikes(videoId: string, options: { cursor?: string; limit?: number } = {}) {
    const limit = options.limit || 20;
    
    const likes = await this.prisma.like.findMany({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
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

    const hasMore = likes.length > limit;
    const items = likes.slice(0, limit);

    return {
      data: items.map((like) => ({
        id: like.id,
        user: {
          id: like.user.id,
          name: like.user.profile?.displayName || null,
          avatarUrl: like.user.profile?.avatarUrl || null,
        },
        createdAt: like.createdAt,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : undefined,
      hasMore,
    };
  }

  /**
   * Obter vídeos curtidos por um usuário
   */
  async getUserLikedVideos(userId: string, options: { cursor?: string; limit?: number } = {}) {
    const limit = options.limit || 20;
    
    const likes = await this.prisma.like.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      include: {
        video: {
          include: {
            user: {
              select: {
                profile: {
                  select: {
                    displayName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const hasMore = likes.length > limit;
    const items = likes.slice(0, limit);

    return {
      data: items.map((like) => ({
        id: like.video.id,
        title: like.video.title,
        thumbnailUrl: like.video.thumbnailUrl,
        duration: like.video.duration,
        viewsCount: like.video.viewsCount,
        author: {
          name: like.video.user.profile?.displayName || null,
          avatarUrl: like.video.user.profile?.avatarUrl || null,
        },
        likedAt: like.createdAt,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : undefined,
      hasMore,
    };
  }

  private async invalidateVideoCache(videoId: string): Promise<void> {
    const patterns = [
      `video:${videoId}:*`,
      `feed:*`,
    ];
    
    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
    }
  }
}
