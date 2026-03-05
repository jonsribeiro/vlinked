import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { VideoSharedEvent } from './events/interaction.events';
import { SharePlatform } from './dto/interactions.dto';

@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Registrar compartilhamento de vídeo
   */
  async shareVideo(
    userId: string,
    videoId: string,
    platform: SharePlatform,
  ): Promise<{ success: boolean; shortUrl?: string; embedCode?: string }> {
    // Verificar se vídeo existe
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { 
        id: true, 
        title: true, 
        sharesCount: true,
        processedUrl: true,
        thumbnailUrl: true,
      },
    });

    if (!video) {
      return { success: false };
    }

    // Criar registro de share e atualizar contador
    const [share, updatedVideo] = await this.prisma.$transaction([
      this.prisma.share.create({
        data: {
          userId,
          videoId,
          platform,
        },
      }),
      this.prisma.video.update({
        where: { id: videoId },
        data: {
          sharesCount: {
            increment: 1,
          },
        },
      }),
    ]);

    // Gerar URL curta ou embed code se necessário
    let shortUrl: string | undefined;
    let embedCode: string | undefined;

    if (platform === SharePlatform.COPY_LINK) {
      shortUrl = await this.generateShortUrl(videoId);
    } else if (platform === SharePlatform.EMBED) {
      embedCode = this.generateEmbedCode(video);
    }

    // Atualizar share com URL curta
    if (shortUrl) {
      await this.prisma.share.update({
        where: { id: share.id },
        data: { shortUrl },
      });
    }

    // Emitir evento
    const event: VideoSharedEvent = {
      shareId: share.id,
      videoId,
      userId,
      platform,
      sharedAt: new Date(),
      sharesCount: updatedVideo.sharesCount,
    };
    this.eventEmitter.emit('video.shared', event);

    this.logger.log(`Vídeo compartilhado: ${videoId} na plataforma ${platform}`);

    return {
      success: true,
      shortUrl,
      embedCode,
    };
  }

  /**
   * Obter estatísticas de compartilhamento de um vídeo
   */
  async getVideoShareStats(videoId: string) {
    const cacheKey = `shares:stats:${videoId}`;
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const [totalShares, platformBreakdown] = await Promise.all([
      this.prisma.share.count({ where: { videoId } }),
      this.prisma.share.groupBy({
        by: ['platform'],
        where: { videoId },
        _count: {
          platform: true,
        },
      }),
    ]);

    const result = {
      totalShares,
      platformBreakdown: platformBreakdown.reduce((acc, item) => {
        acc[item.platform] = item._count.platform;
        return acc;
      }, {} as Record<string, number>),
    };

    await this.redis.setex(cacheKey, 300, JSON.stringify(result));

    return result;
  }

  /**
   * Obter vídeos mais compartilhados
   */
  async getMostSharedVideos(options: { limit?: number; timeframe?: 'day' | 'week' | 'month' } = {}) {
    const limit = options.limit || 10;
    const timeframe = options.timeframe || 'week';
    
    const since = this.getTimeframeDate(timeframe);

    const videos = await this.prisma.video.findMany({
      where: {
        visibility: 'PUBLIC',
        status: 'READY',
        sharesCount: { gt: 0 },
      },
      orderBy: { sharesCount: 'desc' },
      take: limit,
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

    return videos.map((video) => ({
      id: video.id,
      title: video.title,
      thumbnailUrl: video.thumbnailUrl,
      sharesCount: video.sharesCount,
      author: {
        name: video.user.profile?.name,
        avatarUrl: video.user.profile?.avatarUrl,
      },
    }));
  }

  /**
   * Resolver URL curta para URL completa
   */
  async resolveShortUrl(shortCode: string): Promise<string | null> {
    const videoId = await this.redis.get(`shorturl:${shortCode}`);
    if (!videoId) {
      return null;
    }

    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true },
    });

    if (!video) {
      return null;
    }

    // Retornar URL do vídeo (frontend URL)
    const baseUrl = process.env.FRONTEND_URL || 'https://vlinked.app';
    return `${baseUrl}/video/${videoId}`;
  }

  // ==================== Private Methods ====================

  private async generateShortUrl(videoId: string): Promise<string> {
    // Gerar código curto único
    const shortCode = this.generateShortCode();
    
    // Salvar mapeamento no Redis (expira em 30 dias)
    await this.redis.setex(`shorturl:${shortCode}`, 30 * 24 * 3600, videoId);
    
    const baseUrl = process.env.FRONTEND_URL || 'https://vlinked.app';
    return `${baseUrl}/s/${shortCode}`;
  }

  private generateShortCode(): string {
    // Gerar código alfanumérico de 6 caracteres
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateEmbedCode(video: any): string {
    const baseUrl = process.env.FRONTEND_URL || 'https://vlinked.app';
    const iframeSrc = `${baseUrl}/embed/${video.id}`;
    
    return `<iframe 
  src="${iframeSrc}" 
  width="640" 
  height="360" 
  frameborder="0" 
  allowfullscreen
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
></iframe>`;
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
      default:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  }
}
