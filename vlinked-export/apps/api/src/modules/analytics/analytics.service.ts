import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import {
  VideoLikedEvent,
  VideoUnlikedEvent,
  VideoCommentedEvent,
  CommentDeletedEvent,
  ProfileFollowedEvent,
  ProfileUnfollowedEvent,
  VideoSharedEvent,
  VideoViewedEvent,
  ViewMetricsUpdatedEvent,
} from '../interactions/events/interaction.events';

export interface TimeSeriesData {
  timestamp: Date;
  value: number;
}

export interface VideoAnalytics {
  videoId: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTime: number;
  completionRate: number;
  skipRate: number;
  uniqueViewers: number;
}

export interface ProfileAnalytics {
  userId: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  followersCount: number;
  followingCount: number;
  videosCount: number;
  engagementRate: number;
}

/**
 * Analytics Service
 * 
 * Responsabilidades:
 * - Coletar e processar eventos de interação
 * - Agregar métricas em time-series
 * - Gerar relatórios de analytics
 * - Alimentar o Discovery Engine e Professional Reputation System
 * 
 * Eventos consumidos:
 * - video.liked/unliked
 * - video.commented/deleted
 * - profile.followed/unfollowed
 * - video.shared
 * - video.viewed
 * - view.metrics.updated
 */
@Injectable()
export class AnalyticsService implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    this.logger.log('AnalyticsService inicializado');
  }

  // ==================== EVENT HANDLERS ====================

  /**
   * Handler: Vídeo curtido
   */
  @OnEvent('video.liked', { async: true })
  async handleVideoLiked(event: VideoLikedEvent): Promise<void> {
    await this.trackEvent({
      eventType: 'video_liked',
      userId: event.userId,
      entityType: 'video',
      entityId: event.videoId,
      metadata: {
        likesCount: event.likesCount,
      },
      timestamp: event.likedAt,
    });

    // Atualizar métricas do vídeo
    await this.updateVideoEngagementMetrics(event.videoId);
  }

  /**
   * Handler: Vídeo descurtido
   */
  @OnEvent('video.unliked', { async: true })
  async handleVideoUnliked(event: VideoUnlikedEvent): Promise<void> {
    await this.trackEvent({
      eventType: 'video_unliked',
      userId: event.userId,
      entityType: 'video',
      entityId: event.videoId,
      metadata: {
        likesCount: event.likesCount,
      },
      timestamp: event.unlikedAt,
    });

    await this.updateVideoEngagementMetrics(event.videoId);
  }

  /**
   * Handler: Vídeo comentado
   */
  @OnEvent('video.commented', { async: true })
  async handleVideoCommented(event: VideoCommentedEvent): Promise<void> {
    await this.trackEvent({
      eventType: 'video_commented',
      userId: event.userId,
      entityType: 'video',
      entityId: event.videoId,
      metadata: {
        commentId: event.commentId,
        parentId: event.parentId,
        commentsCount: event.commentsCount,
      },
      timestamp: event.commentedAt,
    });

    await this.updateVideoEngagementMetrics(event.videoId);
  }

  /**
   * Handler: Comentário deletado
   */
  @OnEvent('comment.deleted', { async: true })
  async handleCommentDeleted(event: CommentDeletedEvent): Promise<void> {
    await this.trackEvent({
      eventType: 'comment_deleted',
      userId: event.userId,
      entityType: 'comment',
      entityId: event.commentId,
      metadata: {
        videoId: event.videoId,
        commentsCount: event.commentsCount,
      },
      timestamp: event.deletedAt,
    });

    await this.updateVideoEngagementMetrics(event.videoId);
  }

  /**
   * Handler: Perfil seguido
   */
  @OnEvent('profile.followed', { async: true })
  async handleProfileFollowed(event: ProfileFollowedEvent): Promise<void> {
    await this.trackEvent({
      eventType: 'profile_followed',
      userId: event.followerId,
      entityType: 'profile',
      entityId: event.followingId,
      metadata: {
        followersCount: event.followersCount,
      },
      timestamp: event.followedAt,
    });

    await this.updateProfileMetrics(event.followingId);
  }

  /**
   * Handler: Perfil deixado de seguir
   */
  @OnEvent('profile.unfollowed', { async: true })
  async handleProfileUnfollowed(event: ProfileUnfollowedEvent): Promise<void> {
    await this.trackEvent({
      eventType: 'profile_unfollowed',
      userId: event.followerId,
      entityType: 'profile',
      entityId: event.followingId,
      metadata: {
        followersCount: event.followersCount,
      },
      timestamp: event.unfollowedAt,
    });

    await this.updateProfileMetrics(event.followingId);
  }

  /**
   * Handler: Vídeo compartilhado
   */
  @OnEvent('video.shared', { async: true })
  async handleVideoShared(event: VideoSharedEvent): Promise<void> {
    await this.trackEvent({
      eventType: 'video_shared',
      userId: event.userId,
      entityType: 'video',
      entityId: event.videoId,
      metadata: {
        shareId: event.shareId,
        platform: event.platform,
        sharesCount: event.sharesCount,
      },
      timestamp: event.sharedAt,
    });

    await this.updateVideoEngagementMetrics(event.videoId);
  }

  /**
   * Handler: Vídeo visualizado
   */
  @OnEvent('video.viewed', { async: true })
  async handleVideoViewed(event: VideoViewedEvent): Promise<void> {
    await this.trackEvent({
      eventType: 'video_viewed',
      userId: event.userId,
      entityType: 'video',
      entityId: event.videoId,
      metadata: {
        viewId: event.viewId,
        watchTime: event.watchTime,
        percentWatched: event.percentWatched,
        completed: event.completed,
        skipped: event.skipped,
        skipAt: event.skipAt,
        viewsCount: event.viewsCount,
        country: event.country,
      },
      timestamp: event.viewedAt,
    });

    // Agregar em time-series (para gráficos)
    await this.aggregateViewInTimeSeries(event);
  }

  /**
   * Handler: Métricas de view atualizadas
   */
  @OnEvent('view.metrics.updated', { async: true })
  async handleViewMetricsUpdated(event: ViewMetricsUpdatedEvent): Promise<void> {
    this.logger.log(`Métricas atualizadas para vídeo ${event.videoId}`);

    // Atualizar fatores de ranking no FeedItem
    await this.updateFeedItemFactors(event.videoId, event.metrics);
  }

  // ==================== PUBLIC METHODS ====================

  /**
   * Obter analytics de um vídeo
   */
  async getVideoAnalytics(videoId: string, timeframe: 'day' | 'week' | 'month' | 'year' = 'week'): Promise<VideoAnalytics> {
    const since = this.getTimeframeDate(timeframe);

    const [
      video,
      viewMetrics,
      viewsTimeSeries,
      likesTimeSeries,
    ] = await Promise.all([
      this.prisma.video.findUnique({
        where: { id: videoId },
        select: {
          viewsCount: true,
          likesCount: true,
          commentsCount: true,
          sharesCount: true,
        },
      }),
      this.prisma.viewMetrics.findUnique({
        where: { videoId },
      }),
      this.getTimeSeriesData('video_viewed', videoId, since),
      this.getTimeSeriesData('video_liked', videoId, since),
    ]);

    if (!video) {
      throw new Error('Vídeo não encontrado');
    }

    return {
      videoId,
      views: video.viewsCount,
      likes: video.likesCount,
      comments: video.commentsCount,
      shares: video.sharesCount,
      watchTime: viewMetrics?.avgWatchTime || 0,
      completionRate: viewMetrics?.avgCompletionRate || 0,
      skipRate: viewMetrics?.avgSkipRate || 0,
      uniqueViewers: viewMetrics?.uniqueViewers || 0,
    };
  }

  /**
   * Obter analytics de um perfil
   */
  async getProfileAnalytics(userId: string): Promise<ProfileAnalytics> {
    const [
      profile,
      videosStats,
      totalViews,
      totalLikes,
      totalComments,
      totalShares,
    ] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { userId },
        select: {
          followersCount: true,
        },
      }),
      this.prisma.video.aggregate({
        where: { userId },
        _count: { id: true },
      }),
      this.prisma.video.aggregate({
        where: { userId },
        _sum: { viewsCount: true },
      }),
      this.prisma.video.aggregate({
        where: { userId },
        _sum: { likesCount: true },
      }),
      this.prisma.video.aggregate({
        where: { userId },
        _sum: { commentsCount: true },
      }),
      this.prisma.video.aggregate({
        where: { userId },
        _sum: { sharesCount: true },
      }),
    ]);

    const followingCount = await this.prisma.follow.count({
      where: { followerId: userId },
    });

    const views = totalViews._sum.viewsCount || 0;
    const likes = totalLikes._sum.likesCount || 0;
    const engagementRate = views > 0 ? (likes / views) * 100 : 0;

    return {
      userId,
      totalViews: views,
      totalLikes: likes,
      totalComments: totalComments._sum.commentsCount || 0,
      totalShares: totalShares._sum.sharesCount || 0,
      followersCount: profile?.followersCount || 0,
      followingCount,
      videosCount: videosStats._count.id,
      engagementRate: Math.round(engagementRate * 100) / 100,
    };
  }

  /**
   * Obter relatório de engajamento
   */
  async getEngagementReport(entityType: 'video' | 'profile', entityId: string, days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const events = await this.prisma.analyticsEvent.findMany({
      where: {
        entityType,
        entityId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Agrupar por dia
    const dailyStats = this.groupEventsByDay(events);

    return {
      entityType,
      entityId,
      period: `${days}d`,
      dailyStats,
      totals: this.calculateTotals(events),
    };
  }

  // ==================== PRIVATE METHODS ====================

  private async trackEvent(event: {
    eventType: string;
    userId?: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, any>;
    timestamp: Date;
  }): Promise<void> {
    try {
      await this.prisma.analyticsEvent.create({
        data: {
          eventType: event.eventType,
          userId: event.userId,
          entityType: event.entityType,
          entityId: event.entityId,
          metadata: event.metadata,
          createdAt: event.timestamp,
        },
      });
    } catch (error) {
      this.logger.error(`Erro ao registrar evento: ${event.eventType}`, error);
    }
  }

  private async updateVideoEngagementMetrics(videoId: string): Promise<void> {
    // Invalidar cache de analytics
    await this.redis.del(`analytics:video:${videoId}`);
  }

  private async updateProfileMetrics(userId: string): Promise<void> {
    // Invalidar cache de analytics
    await this.redis.del(`analytics:profile:${userId}`);
  }

  private async aggregateViewInTimeSeries(event: VideoViewedEvent): Promise<void> {
    const date = new Date(event.viewedAt);
    const hourKey = `${date.toISOString().split('T')[0]}:${date.getHours()}`;
    const redisKey = `analytics:timeseries:views:${event.videoId}:${hourKey}`;

    // Incrementar contador no Redis
    await this.redis.incr(redisKey);
    await this.redis.expire(redisKey, 7 * 24 * 3600); // Expirar em 7 dias
  }

  private async updateFeedItemFactors(
    videoId: string,
    metrics: {
      avgWatchTime: number;
      avgCompletionRate: number;
      avgSkipRate: number;
    },
  ): Promise<void> {
    // Atualizar fatores no FeedItem para re-ranking
    const feedItems = await this.prisma.feedItem.findMany({
      where: { videoId },
    });

    for (const item of feedItems) {
      const factors = item.factors as any;
      
      // Atualizar com novas métricas
      await this.prisma.feedItem.update({
        where: { id: item.id },
        data: {
          factors: {
            ...factors,
            watchTime: metrics.avgWatchTime,
            completionRate: metrics.avgCompletionRate,
            skipRate: metrics.avgSkipRate,
          },
        },
      });
    }
  }

  private async getTimeSeriesData(
    eventType: string,
    entityId: string,
    since: Date,
  ): Promise<TimeSeriesData[]> {
    const events = await this.prisma.analyticsEvent.findMany({
      where: {
        eventType,
        entityId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Agrupar por hora
    const grouped = new Map<string, number>();
    for (const event of events) {
      const hour = event.createdAt.toISOString().split(':')[0] + ':00:00.000Z';
      grouped.set(hour, (grouped.get(hour) || 0) + 1);
    }

    return Array.from(grouped.entries()).map(([timestamp, value]) => ({
      timestamp: new Date(timestamp),
      value,
    }));
  }

  private groupEventsByDay(events: any[]): Record<string, any> {
    const grouped: Record<string, any> = {};

    for (const event of events) {
      const day = event.createdAt.toISOString().split('T')[0];
      if (!grouped[day]) {
        grouped[day] = {
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
        };
      }

      switch (event.eventType) {
        case 'video_viewed':
          grouped[day].views++;
          break;
        case 'video_liked':
          grouped[day].likes++;
          break;
        case 'video_commented':
          grouped[day].comments++;
          break;
        case 'video_shared':
          grouped[day].shares++;
          break;
      }
    }

    return grouped;
  }

  private calculateTotals(events: any[]): Record<string, number> {
    const totals = {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
    };

    for (const event of events) {
      switch (event.eventType) {
        case 'video_viewed':
          totals.views++;
          break;
        case 'video_liked':
          totals.likes++;
          break;
        case 'video_commented':
          totals.comments++;
          break;
        case 'video_shared':
          totals.shares++;
          break;
      }
    }

    return totals;
  }

  private getTimeframeDate(timeframe: string): Date {
    const now = new Date();
    switch (timeframe) {
      case 'day':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'month':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case 'year':
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  }
}
