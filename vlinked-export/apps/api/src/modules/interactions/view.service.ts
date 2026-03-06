import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { VideoViewedEvent, ViewMetricsUpdatedEvent } from './events/interaction.events';

export interface ViewTrackingData {
  watchTime: number;
  percentWatched: number;
  completed: boolean;
  skipped: boolean;
  skipAt?: number;
  videoDuration?: number;
}

@Injectable()
export class ViewService {
  private readonly logger = new Logger(ViewService.name);
  private readonly VIEW_COOLDOWN = 24 * 3600; // 24 horas em segundos

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Registrar visualização de vídeo com métricas detalhadas
   */
  async trackView(
    videoId: string,
    data: ViewTrackingData,
    context: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
      country?: string;
      referrer?: string;
      sessionId?: string;
    },
  ): Promise<{ tracked: boolean; viewsCount: number; isNewView: boolean }> {
    // Verificar se vídeo existe
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { 
        id: true, 
        duration: true, 
        viewsCount: true,
        userId: true,
      },
    });

    if (!video) {
      return { tracked: false, viewsCount: 0, isNewView: false };
    }

    // Verificar se é uma view válida (assistiu pelo menos 3 segundos ou 10%)
    const minWatchTime = 3;
    const minPercentWatched = 10;
    
    if (data.watchTime < minWatchTime && data.percentWatched < minPercentWatched) {
      this.logger.debug(`View ignorada: watchTime=${data.watchTime}, percent=${data.percentWatched}`);
      return { tracked: false, viewsCount: video.viewsCount, isNewView: false };
    }

    // Verificar cooldown para usuários logados
    let isNewView = true;
    if (context.userId) {
      const viewKey = `view:${videoId}:${context.userId}`;
      const lastView = await this.redis.get(viewKey);
      
      if (lastView) {
        isNewView = false;
      } else {
        // Registrar view no Redis (cooldown de 24h)
        await this.redis.set(viewKey, Date.now().toString(), this.VIEW_COOLDOWN);
      }
    }

    // Criar registro de view
    const view = await this.prisma.view.create({
      data: {
        videoId,
        userId: context.userId,
        duration: data.watchTime,
        completed: data.completed,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        country: context.country,
      },
    });

    let updatedVideo = video;

    // Se for view nova, incrementar contador
    if (isNewView) {
      updatedVideo = await this.prisma.video.update({
        where: { id: videoId },
        data: {
          viewsCount: {
            increment: 1,
          },
        },
      });
    }

    // Salvar métricas detalhadas no Redis para processamento batch
    await this.saveViewMetrics(videoId, data, context.userId);

    // Emitir evento
    const event: VideoViewedEvent = {
      viewId: view.id,
      videoId,
      userId: context.userId,
      watchTime: data.watchTime,
      percentWatched: data.percentWatched,
      completed: data.completed,
      skipped: data.skipped,
      skipAt: data.skipAt,
      viewedAt: new Date(),
      viewsCount: updatedVideo.viewsCount,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      country: context.country,
      referrer: context.referrer,
    };
    this.eventEmitter.emit('video.viewed', event);

    this.logger.debug(`View registrada: ${videoId}, watchTime=${data.watchTime}s, completed=${data.completed}`);

    return {
      tracked: true,
      viewsCount: updatedVideo.viewsCount,
      isNewView,
    };
  }

  /**
   * Salvar métricas de view para processamento batch
   */
  private async saveViewMetrics(
    videoId: string,
    data: ViewTrackingData,
    userId?: string,
  ): Promise<void> {
    const metricsKey = `viewmetrics:pending:${videoId}`;
    
    // Adicionar métrica à lista pendente
    const metric = {
      watchTime: data.watchTime,
      percentWatched: data.percentWatched,
      completed: data.completed,
      skipped: data.skipped,
      skipAt: data.skipAt,
      userId: userId || 'anonymous',
      timestamp: Date.now(),
    };

    await this.redis.lpush(metricsKey, JSON.stringify(metric));
    
    // Expirar em 7 dias se não processado
    await this.redis.expire(metricsKey, 7 * 24 * 3600);
  }

  /**
   * Processar métricas pendentes e atualizar ViewMetrics
   */
  async processPendingMetrics(videoId: string): Promise<void> {
    const metricsKey = `viewmetrics:pending:${videoId}`;
    
    // Obter todas as métricas pendentes
    const pendingMetrics = await this.redis.lrange(metricsKey, 0, -1);
    
    if (pendingMetrics.length === 0) {
      return;
    }

    // Parse métricas
    const metrics = pendingMetrics.map((m) => JSON.parse(m));

    // Calcular estatísticas
    const totalViews = metrics.length;
    const uniqueViewers = new Set(metrics.map((m: any) => m.userId)).size;
    const avgWatchTime = metrics.reduce((sum: number, m: any) => sum + m.watchTime, 0) / totalViews;
    const avgCompletionRate = metrics.reduce((sum: number, m: any) => sum + (m.percentWatched / 100), 0) / totalViews;
    const skipCount = metrics.filter((m: any) => m.skipped).length;
    const avgSkipRate = skipCount / totalViews;

    // Calcular distribuição de watch time
    const watchTimeDistribution = this.calculateWatchTimeDistribution(metrics);

    // Calcular pontos de drop-off
    const dropOffPoints = this.calculateDropOffPoints(metrics);

    // Calcular curva de retenção
    const retentionCurve = this.calculateRetentionCurve(metrics);

    // Atualizar ou criar ViewMetrics
    await this.prisma.viewMetrics.upsert({
      where: { videoId },
      update: {
        totalViews,
        uniqueViewers,
        avgWatchTime,
        avgCompletionRate,
        avgSkipRate,
        watchTimeDistribution,
        dropOffPoints,
        retentionCurve,
        updatedAt: new Date(),
      },
      create: {
        videoId,
        totalViews,
        uniqueViewers,
        avgWatchTime,
        avgCompletionRate,
        avgSkipRate,
        watchTimeDistribution,
        dropOffPoints,
        retentionCurve,
      },
    });

    // Limpar métricas processadas
    await this.redis.del(metricsKey);

    // Emitir evento de métricas atualizadas
    const event: ViewMetricsUpdatedEvent = {
      videoId,
      metrics: {
        totalViews,
        uniqueViewers,
        avgWatchTime,
        avgCompletionRate,
        avgSkipRate,
        watchTimeDistribution,
        dropOffPoints,
        retentionCurve,
      },
      updatedAt: new Date(),
    };
    this.eventEmitter.emit('view.metrics.updated', event);

    this.logger.log(`Métricas processadas para ${videoId}: ${totalViews} views`);
  }

  /**
   * Obter métricas de um vídeo
   */
  async getVideoMetrics(videoId: string) {
    const cacheKey = `viewmetrics:${videoId}`;
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const metrics = await this.prisma.viewMetrics.findUnique({
      where: { videoId },
    });

    if (!metrics) {
      return null;
    }

    await this.redis.set(cacheKey, JSON.stringify(metrics), 300);

    return metrics;
  }

  /**
   * Obter views recentes de um vídeo
   */
  async getVideoViews(
    videoId: string,
    options: { cursor?: string; limit?: number } = {},
  ) {
    const limit = options.limit || 20;

    const views = await this.prisma.view.findMany({
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

    const hasMore = views.length > limit;
    const items = views.slice(0, limit);

    return {
      data: items.map((view) => ({
        id: view.id,
        user: view.user ? {
          id: view.user.id,
          name: view.user.profile?.displayName || null,
          avatarUrl: view.user.profile?.avatarUrl || null,
        } : null,
        watchTime: view.duration,
        completed: view.completed,
        createdAt: view.createdAt,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : undefined,
      hasMore,
      total: await this.prisma.view.count({ where: { videoId } }),
    };
  }

  /**
   * Obter histórico de views de um usuário
   */
  async getUserViewHistory(
    userId: string,
    options: { cursor?: string; limit?: number } = {},
  ) {
    const limit = options.limit || 20;

    const views = await this.prisma.view.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      include: {
        video: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            duration: true,
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

    const hasMore = views.length > limit;
    const items = views.slice(0, limit);

    return {
      data: items.map((view) => ({
        id: view.video.id,
        title: view.video.title,
        thumbnailUrl: view.video.thumbnailUrl,
        duration: view.video.duration,
        watchTime: view.duration,
        completed: view.completed,
        author: {
          name: view.video.user.profile?.displayName || null,
          avatarUrl: view.video.user.profile?.avatarUrl || null,
        },
        viewedAt: view.createdAt,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : undefined,
      hasMore,
    };
  }

  // ==================== Private Methods ====================

  private calculateWatchTimeDistribution(metrics: any[]): Record<string, number> {
    const distribution: Record<string, number> = {
      '0-25%': 0,
      '25-50%': 0,
      '50-75%': 0,
      '75-100%': 0,
    };

    for (const m of metrics) {
      const percent = m.percentWatched;
      if (percent < 25) distribution['0-25%']++;
      else if (percent < 50) distribution['25-50%']++;
      else if (percent < 75) distribution['50-75%']++;
      else distribution['75-100%']++;
    }

    return distribution;
  }

  private calculateDropOffPoints(metrics: any[]): Record<string, number> {
    // Calcular onde os usuários costumam sair
    const dropOffs: Record<number, number> = {};
    
    for (const m of metrics) {
      if (m.skipped && m.skipAt) {
        const bucket = Math.floor(m.skipAt / 10) * 10; // Agrupar em buckets de 10s
        dropOffs[bucket] = (dropOffs[bucket] || 0) + 1;
      }
    }

    // Converter para porcentagem
    const total = metrics.length;
    const result: Record<string, number> = {};
    
    for (const [bucket, count] of Object.entries(dropOffs)) {
      result[`${bucket}s`] = count / total;
    }

    return result;
  }

  private calculateRetentionCurve(metrics: any[]): number[] {
    // Calcular retenção a cada 10% do vídeo
    const curve: number[] = [];
    
    for (let i = 0; i <= 10; i++) {
      const threshold = i * 10;
      const retained = metrics.filter((m) => m.percentWatched >= threshold).length;
      curve.push(retained / metrics.length);
    }

    return curve;
  }
}
