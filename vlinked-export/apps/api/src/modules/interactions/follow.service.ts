import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProfileFollowedEvent, ProfileUnfollowedEvent } from './events/interaction.events';

@Injectable()
export class FollowService {
  private readonly logger = new Logger(FollowService.name);
  private readonly CACHE_TTL = 300; // 5 minutos

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Seguir um perfil
   */
  async followProfile(followerId: string, followingId: string): Promise<{ following: boolean; followersCount: number }> {
    // Não pode seguir a si mesmo
    if (followerId === followingId) {
      throw new ConflictException('Você não pode seguir a si mesmo');
    }

    // Verificar se perfil existe
    const profile = await this.prisma.profile.findUnique({
      where: { userId: followingId },
      select: { userId: true, followersCount: true },
    });

    if (!profile) {
      throw new NotFoundException('Perfil não encontrado');
    }

    // Verificar se já segue
    const existingFollow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });

    if (existingFollow) {
      return { following: true, followersCount: profile.followersCount };
    }

    // Criar follow e atualizar contador em transação
    const [follow, updatedProfile] = await this.prisma.$transaction([
      this.prisma.follow.create({
        data: {
          followerId,
          followingId,
        },
      }),
      this.prisma.profile.update({
        where: { userId: followingId },
        data: {
          followersCount: {
            increment: 1,
          },
        },
      }),
    ]);

    // Invalidar cache
    await this.invalidateFollowCache(followerId, followingId);

    // Emitir evento
    const event: ProfileFollowedEvent = {
      followerId,
      followingId,
      followedAt: new Date(),
      followersCount: updatedProfile.followersCount,
    };
    this.eventEmitter.emit('profile.followed', event);

    this.logger.log(`Perfil seguido: ${followingId} por ${followerId}`);

    return { following: true, followersCount: updatedProfile.followersCount };
  }

  /**
   * Deixar de seguir um perfil
   */
  async unfollowProfile(followerId: string, followingId: string): Promise<{ following: boolean; followersCount: number }> {
    // Verificar se existe follow
    const existingFollow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });

    if (!existingFollow) {
      const profile = await this.prisma.profile.findUnique({
        where: { userId: followingId },
        select: { followersCount: true },
      });
      return { following: false, followersCount: profile?.followersCount || 0 };
    }

    // Remover follow e atualizar contador em transação
    const [, updatedProfile] = await this.prisma.$transaction([
      this.prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId,
            followingId,
          },
        },
      }),
      this.prisma.profile.update({
        where: { userId: followingId },
        data: {
          followersCount: {
            decrement: 1,
          },
        },
      }),
    ]);

    // Invalidar cache
    await this.invalidateFollowCache(followerId, followingId);

    // Emitir evento
    const event: ProfileUnfollowedEvent = {
      followerId,
      followingId,
      unfollowedAt: new Date(),
      followersCount: Math.max(0, updatedProfile.followersCount),
    };
    this.eventEmitter.emit('profile.unfollowed', event);

    this.logger.log(`Perfil deixado de seguir: ${followingId} por ${followerId}`);

    return { following: false, followersCount: Math.max(0, updatedProfile.followersCount) };
  }

  /**
   * Verificar se usuário segue perfil
   */
  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const cacheKey = `follow:${followerId}:${followingId}`;
    
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) {
      return cached === '1';
    }

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });

    const isFollowing = !!follow;
    await this.redis.setex(cacheKey, this.CACHE_TTL, isFollowing ? '1' : '0');

    return isFollowing;
  }

  /**
   * Obter seguidores de um perfil
   */
  async getFollowers(userId: string, options: { cursor?: string; limit?: number } = {}) {
    const limit = options.limit || 20;

    const followers = await this.prisma.follow.findMany({
      where: { followingId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      include: {
        follower: {
          select: {
            id: true,
            profile: {
              select: {
                name: true,
                avatarUrl: true,
                headline: true,
              },
            },
          },
        },
      },
    });

    const hasMore = followers.length > limit;
    const items = followers.slice(0, limit);

    return {
      data: items.map((f) => ({
        id: f.follower.id,
        name: f.follower.profile?.name,
        avatarUrl: f.follower.profile?.avatarUrl,
        headline: f.follower.profile?.headline,
        followedAt: f.createdAt,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : undefined,
      hasMore,
      total: await this.prisma.follow.count({
        where: { followingId: userId },
      }),
    };
  }

  /**
   * Obter quem o usuário segue
   */
  async getFollowing(userId: string, options: { cursor?: string; limit?: number } = {}) {
    const limit = options.limit || 20;

    const following = await this.prisma.follow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      include: {
        following: {
          select: {
            id: true,
            profile: {
              select: {
                name: true,
                avatarUrl: true,
                headline: true,
              },
            },
          },
        },
      },
    });

    const hasMore = following.length > limit;
    const items = following.slice(0, limit);

    return {
      data: items.map((f) => ({
        id: f.following.id,
        name: f.following.profile?.name,
        avatarUrl: f.following.profile?.avatarUrl,
        headline: f.following.profile?.headline,
        followedAt: f.createdAt,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : undefined,
      hasMore,
      total: await this.prisma.follow.count({
        where: { followerId: userId },
      }),
    };
  }

  /**
   * Obter estatísticas de follows
   */
  async getFollowStats(userId: string) {
    const cacheKey = `follow:stats:${userId}`;
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const [followersCount, followingCount] = await Promise.all([
      this.prisma.follow.count({ where: { followingId: userId } }),
      this.prisma.follow.count({ where: { followerId: userId } }),
    ]);

    const result = {
      followersCount,
      followingCount,
    };

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Obter feed de quem o usuário segue
   */
  async getFollowingFeed(userId: string, options: { cursor?: string; limit?: number } = {}) {
    const limit = options.limit || 20;

    // Buscar IDs de quem o usuário segue
    const followingIds = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });

    if (followingIds.length === 0) {
      return { data: [], hasMore: false, total: 0 };
    }

    const ids = followingIds.map((f) => f.followingId);

    // Buscar vídeos recentes desses usuários
    const videos = await this.prisma.video.findMany({
      where: {
        userId: { in: ids },
        visibility: 'PUBLIC',
        status: 'READY',
      },
      orderBy: { publishedAt: 'desc' },
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      include: {
        user: {
          select: {
            profile: {
              select: {
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    const hasMore = videos.length > limit;
    const items = videos.slice(0, limit);

    return {
      data: items.map((video) => ({
        id: video.id,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        duration: video.duration,
        viewsCount: video.viewsCount,
        likesCount: video.likesCount,
        author: {
          name: video.user.profile?.name,
          avatarUrl: video.user.profile?.avatarUrl,
        },
        publishedAt: video.publishedAt,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : undefined,
      hasMore,
    };
  }

  private async invalidateFollowCache(followerId: string, followingId: string): Promise<void> {
    const keys = [
      `follow:${followerId}:${followingId}`,
      `follow:stats:${followerId}`,
      `follow:stats:${followingId}`,
      `feed:following:${followerId}:*`,
    ];

    await this.redis.del(...keys);
  }
}
