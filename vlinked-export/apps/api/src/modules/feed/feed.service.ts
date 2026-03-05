import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

export type FeedType = 'for-you' | 'following' | 'trending' | 'recent';

export interface FeedOptions {
  cursor?: string;
  limit?: number;
}

export interface FeedResult {
  items: FeedItem[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface FeedItem {
  id: string;
  video: {
    id: string;
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    duration: number | null;
    hlsUrl: string | null;
    viewsCount: number;
    likesCount: number;
    commentsCount: number;
    createdAt: Date;
  };
  author: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
    headline: string | null;
    verified: boolean;
  };
  score: number;
  factors?: {
    recency: number;
    engagement: number;
    aiRelevance: number;
    profileScore: number;
  };
}

/**
 * Serviço de Feed
 * 
 * Responsabilidades:
 * - Feed personalizado (algoritmo de recomendação)
 * - Feed "Para Você"
 * - Feed de seguindo
 * - Trending/Em alta
 * - Vídeos recentes
 * - Vídeos por tag
 * - Vídeos relacionados
 * 
 * Cache: Redis para feed pré-computado
 */
@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);
  private readonly FEED_CACHE_TTL = 300; // 5 minutos
  private readonly FEED_PAGE_SIZE = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Feed principal personalizado
   * Combina: Para Você + Following + Trending (ponderado)
   */
  async getPersonalizedFeed(userId: string, options: FeedOptions = {}): Promise<FeedResult> {
    const cacheKey = `feed:personalized:${userId}:${options.cursor || 'first'}`;
    
    // Tentar cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const limit = options.limit || this.FEED_PAGE_SIZE;

    // Buscar feed items do banco (pré-indexados)
    const feedItems = await this.prisma.feedItem.findMany({
      where: {
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: [
        { score: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit + 1,
      skip: options.cursor ? parseInt(Buffer.from(options.cursor, 'base64').toString()) : 0,
      include: {
        video: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });

    const hasMore = feedItems.length > limit;
    const items = feedItems.slice(0, limit);

    const result: FeedResult = {
      items: items.map((item) => this.mapToFeedItem(item)),
      nextCursor: hasMore 
        ? Buffer.from((parseInt(options.cursor || '0') + limit).toString()).toString('base64')
        : undefined,
      hasMore,
    };

    // Salvar no cache
    await this.redis.setex(cacheKey, this.FEED_CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Feed "Para Você" (recomendações baseadas em interesses)
   */
  async getForYouFeed(userId: string, options: FeedOptions = {}): Promise<FeedResult> {
    const cacheKey = `feed:foryou:${userId}:${options.cursor || 'first'}`;
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Buscar perfil do usuário para personalização
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: {
        skills: true,
        interests: true,
      },
    });

    const userInterests = [
      ...(profile?.skills || []),
      ...(profile?.interests || []),
    ];

    const limit = options.limit || this.FEED_PAGE_SIZE;

    // Buscar vídeos com tags relacionadas aos interesses
    const feedItems = await this.prisma.feedItem.findMany({
      where: {
        expiresAt: { gt: new Date() },
        video: {
          aiTags: userInterests.length > 0 ? { hasSome: userInterests } : undefined,
        },
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      skip: options.cursor ? parseInt(Buffer.from(options.cursor, 'base64').toString()) : 0,
      include: {
        video: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });

    const hasMore = feedItems.length > limit;
    const items = feedItems.slice(0, limit);

    const result: FeedResult = {
      items: items.map((item) => this.mapToFeedItem(item)),
      nextCursor: hasMore
        ? Buffer.from((parseInt(options.cursor || '0') + limit).toString()).toString('base64')
        : undefined,
      hasMore,
    };

    await this.redis.setex(cacheKey, this.FEED_CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Feed de quem o usuário segue
   */
  async getFollowingFeed(userId: string, options: FeedOptions = {}): Promise<FeedResult> {
    const cacheKey = `feed:following:${userId}:${options.cursor || 'first'}`;
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // TODO: Implementar sistema de following
    // Por enquanto, retornar feed vazio
    const result: FeedResult = {
      items: [],
      hasMore: false,
    };

    await this.redis.setex(cacheKey, this.FEED_CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Vídeos em alta (trending)
   */
  async getTrending(options: { 
    timeframe: 'day' | 'week' | 'month'; 
    limit?: number;
  }): Promise<FeedResult> {
    const cacheKey = `feed:trending:${options.timeframe}`;
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const timeframeDate = this.getTimeframeDate(options.timeframe);
    const limit = options.limit || this.FEED_PAGE_SIZE;

    // Buscar vídeos mais engajados no período
    const videos = await this.prisma.video.findMany({
      where: {
        visibility: 'PUBLIC',
        status: 'READY',
        publishedAt: { gte: timeframeDate },
      },
      orderBy: [
        { viewsCount: 'desc' },
        { likesCount: 'desc' },
      ],
      take: limit,
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    const result: FeedResult = {
      items: videos.map((video) => this.mapVideoToFeedItem(video)),
      hasMore: false,
    };

    // Cache por 10 minutos para trending
    await this.redis.setex(cacheKey, 600, JSON.stringify(result));

    return result;
  }

  /**
   * Vídeos mais recentes
   */
  async getRecent(options: FeedOptions = {}): Promise<FeedResult> {
    const limit = options.limit || this.FEED_PAGE_SIZE;

    const videos = await this.prisma.video.findMany({
      where: {
        visibility: 'PUBLIC',
        status: 'READY',
      },
      orderBy: { publishedAt: 'desc' },
      take: limit + 1,
      skip: options.cursor ? parseInt(Buffer.from(options.cursor, 'base64').toString()) : 0,
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    const hasMore = videos.length > limit;
    const items = videos.slice(0, limit);

    return {
      items: items.map((video) => this.mapVideoToFeedItem(video)),
      nextCursor: hasMore
        ? Buffer.from((parseInt(options.cursor || '0') + limit).toString()).toString('base64')
        : undefined,
      hasMore,
    };
  }

  /**
   * Vídeos por tag
   */
  async getByTag(tag: string, options: FeedOptions = {}): Promise<FeedResult> {
    const cacheKey = `feed:tag:${tag}:${options.cursor || 'first'}`;
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const limit = options.limit || this.FEED_PAGE_SIZE;

    const videos = await this.prisma.video.findMany({
      where: {
        visibility: 'PUBLIC',
        status: 'READY',
        aiTags: { has: tag },
      },
      orderBy: [{ viewsCount: 'desc' }, { publishedAt: 'desc' }],
      take: limit + 1,
      skip: options.cursor ? parseInt(Buffer.from(options.cursor, 'base64').toString()) : 0,
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    const hasMore = videos.length > limit;
    const items = videos.slice(0, limit);

    const result: FeedResult = {
      items: items.map((video) => this.mapVideoToFeedItem(video)),
      nextCursor: hasMore
        ? Buffer.from((parseInt(options.cursor || '0') + limit).toString()).toString('base64')
        : undefined,
      hasMore,
    };

    await this.redis.setex(cacheKey, this.FEED_CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Vídeos relacionados a um vídeo específico
   */
  async getRelatedVideos(videoId: string, options: { limit?: number } = {}): Promise<FeedResult> {
    const cacheKey = `feed:related:${videoId}`;
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Buscar tags do vídeo original
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { aiTags: true },
    });

    if (!video || video.aiTags.length === 0) {
      return { items: [], hasMore: false };
    }

    const limit = options.limit || 10;

    // Buscar vídeos com tags similares
    const related = await this.prisma.video.findMany({
      where: {
        id: { not: videoId },
        visibility: 'PUBLIC',
        status: 'READY',
        aiTags: { hasSome: video.aiTags },
      },
      orderBy: [{ viewsCount: 'desc' }, { publishedAt: 'desc' }],
      take: limit,
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    const result: FeedResult = {
      items: related.map((v) => this.mapVideoToFeedItem(v)),
      hasMore: false,
    };

    // Cache por 1 hora
    await this.redis.setex(cacheKey, 3600, JSON.stringify(result));

    return result;
  }

  /**
   * Invalida cache do feed quando novo vídeo é indexado
   */
  @OnEvent('video.indexed')
  async handleVideoIndexed(payload: { videoId: string }): Promise<void> {
    this.logger.log(`Invalidando cache do feed para novo vídeo: ${payload.videoId}`);
    
    // Invalidar caches de feed
    const patterns = ['feed:personalized:*', 'feed:foryou:*', 'feed:recent', 'feed:trending:*'];
    
    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  // ==================== Private Methods ====================

  private mapToFeedItem(item: any): FeedItem {
    return {
      id: item.id,
      video: {
        id: item.video.id,
        title: item.video.title,
        description: item.video.description,
        thumbnailUrl: item.video.thumbnailUrl,
        duration: item.video.duration,
        hlsUrl: item.video.processedUrl,
        viewsCount: item.video.viewsCount,
        likesCount: item.video.likesCount,
        commentsCount: item.video.commentsCount,
        createdAt: item.video.createdAt,
      },
      author: {
        id: item.video.user.id,
        name: item.video.user.profile?.name,
        avatarUrl: item.video.user.profile?.avatarUrl,
        headline: item.video.user.profile?.headline,
        verified: item.video.user.profile?.verified || false,
      },
      score: item.score,
      factors: item.factors as any,
    };
  }

  private mapVideoToFeedItem(video: any): FeedItem {
    return {
      id: video.id,
      video: {
        id: video.id,
        title: video.title,
        description: video.description,
        thumbnailUrl: video.thumbnailUrl,
        duration: video.duration,
        hlsUrl: video.processedUrl,
        viewsCount: video.viewsCount,
        likesCount: video.likesCount,
        commentsCount: video.commentsCount,
        createdAt: video.createdAt,
      },
      author: {
        id: video.user.id,
        name: video.user.profile?.name,
        avatarUrl: video.user.profile?.avatarUrl,
        headline: video.user.profile?.headline,
        verified: video.user.profile?.verified || false,
      },
      score: 0,
    };
  }

  private getTimeframeDate(timeframe: 'day' | 'week' | 'month'): Date {
    const now = new Date();
    switch (timeframe) {
      case 'day':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'month':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }
}
