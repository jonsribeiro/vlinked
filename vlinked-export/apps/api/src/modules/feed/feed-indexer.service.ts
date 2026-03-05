import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

// Interface para os fatores de ranking
// Estrutura alinhada com FeedItem.factors no schema.prisma
export interface RankingFactors {
  // Fatores atuais
  recency: number;       // 0-1 baseado na idade do vídeo (mais recente = maior)
  engagement: number;    // 0-1 baseado em likes/views, comentários
  aiRelevance: number;   // 0-1 baseado em análise de qualidade/relevância da IA
  profileScore: number;  // 0-1 baseado na reputação do autor/perfil
  
  // Métricas futuras (preparadas para ranking aprimorado)
  watchTime?: number;       // 0-1 tempo médio de visualização
  completionRate?: number;  // 0-1 taxa de conclusão do vídeo
  skipRate?: number;        // 0-1 taxa de pulo (menor é melhor)
}

// Pesos dos fatores (ajustáveis)
const FACTOR_WEIGHTS = {
  recency: 0.30,
  engagement: 0.35,
  aiRelevance: 0.20,
  profileScore: 0.15,
};

@Injectable()
export class FeedIndexerService {
  private readonly logger = new Logger(FeedIndexerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Handler para evento de vídeo analisado
   * Indexa vídeo no feed
   */
  @OnEvent('video.analyzed', { async: true })
  async handleVideoAnalyzed(payload: {
    videoId: string;
    userId: string;
    analysis?: {
      tags: string[];
      sentiment: string;
      topics: string[];
      skills: string[];
    };
  }): Promise<void> {
    this.logger.log(`Evento video.analyzed recebido: ${payload.videoId}`);
    await this.indexVideo(payload.videoId);
  }

  /**
   * Indexa um vídeo no feed
   */
  async indexVideo(videoId: string): Promise<void> {
    this.logger.log(`Indexando vídeo: ${videoId}`);

    // Buscar vídeo completo com perfil do autor
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    if (!video) {
      this.logger.warn(`Vídeo não encontrado: ${videoId}`);
      return;
    }

    // Só indexa vídeos públicos e prontos
    if (video.visibility !== 'PUBLIC' || video.status !== 'READY') {
      this.logger.log(`Vídeo não elegível para feed: ${videoId}`);
      return;
    }

    // Calcular fatores de ranking
    const factors = this.calculateFactors(video);

    // Calcular score final (0-100)
    const score = this.calculateScore(factors);

    // Extrair dados de service discovery do perfil
    const profile = video.user.profile;
    const serviceCategory = video.serviceCategory || profile?.serviceCategory;
    const city = video.city || profile?.city;
    const region = video.region || profile?.region;
    const country = video.country || profile?.country;

    // Criar ou atualizar FeedItem
    await this.prisma.feedItem.upsert({
      where: { videoId },
      create: {
        videoId,
        score,
        factors: factors as any,
        // Service Discovery fields
        serviceCategory,
        city,
        region,
        country,
        impressions: 0,
        clicks: 0,
        expiresAt: this.calculateExpiryDate(),
      },
      update: {
        score,
        factors: factors as any,
        // Service Discovery fields
        serviceCategory,
        city,
        region,
        country,
        expiresAt: this.calculateExpiryDate(),
      },
    });

    // Invalidar cache do feed
    await this.invalidateFeedCache();

    this.logger.log(`Vídeo indexado: ${videoId} (score: ${score.toFixed(2)}, category: ${serviceCategory || 'none'})`);
  }

  /**
   * Re-calcula score de todos os itens do feed
   * Job periódico (diário ou semanal)
   */
  async reindexAll(): Promise<void> {
    this.logger.log('Iniciando re-indexação do feed');

    const feedItems = await this.prisma.feedItem.findMany({
      where: {
        OR: [
          { expiresAt: null },
          { expiresAt: { lt: new Date() } },
        ],
      },
      include: {
        video: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });

    for (const item of feedItems) {
      const factors = this.calculateFactors(item.video);
      const score = this.calculateScore(factors);

      await this.prisma.feedItem.update({
        where: { id: item.id },
        data: {
          score,
          factors: factors as any,
          expiresAt: this.calculateExpiryDate(),
        },
      });
    }

    await this.invalidateFeedCache();

    this.logger.log(`Re-indexação concluída: ${feedItems.length} itens`);
  }

  /**
   * Atualiza métricas de um item do feed
   * Chamado quando há interação (view, like, etc)
   */
  async updateMetrics(videoId: string, metrics: { impressions?: number; clicks?: number }): Promise<void> {
    const updateData: any = {};
    
    if (metrics.impressions !== undefined) {
      updateData.impressions = { increment: metrics.impressions };
    }
    
    if (metrics.clicks !== undefined) {
      updateData.clicks = { increment: metrics.clicks };
    }

    await this.prisma.feedItem.update({
      where: { videoId },
      data: updateData,
    });
  }

  /**
   * Remove vídeo do feed
   * Chamado quando vídeo é deletado ou fica privado
   */
  async removeFromFeed(videoId: string): Promise<void> {
    await this.prisma.feedItem.deleteMany({
      where: { videoId },
    });

    await this.invalidateFeedCache();

    this.logger.log(`Vídeo removido do feed: ${videoId}`);
  }

  /**
   * Calcula os fatores de ranking para um vídeo
   */
  private calculateFactors(video: any): RankingFactors {
    return {
      recency: this.calculateRecencyScore(video.publishedAt || video.createdAt),
      engagement: this.calculateEngagementScore(video),
      aiRelevance: this.calculateAIRelevanceScore(video),
      profileScore: this.calculateProfileScore(video),
    };
  }

  /**
   * Calcula score de recência (0-1)
   * Vídeos mais recentes têm score maior
   */
  private calculateRecencyScore(publishedAt: Date): number {
    const now = new Date().getTime();
    const published = new Date(publishedAt).getTime();
    const ageInHours = (now - published) / (1000 * 60 * 60);

    // Decaimento exponencial: score = 1 / (1 + age/24)
    // Após 24h: 0.5, após 7 dias: ~0.13
    const score = 1 / (1 + ageInHours / 24);
    
    return Math.min(1, Math.max(0, score));
  }

  /**
   * Calcula score de engajamento (0-1)
   * Baseado em likes/views ratio
   */
  private calculateEngagementScore(video: any): number {
    const views = video.viewsCount || 0;
    const likes = video.likesCount || 0;

    if (views === 0) return 0.1; // Score base para vídeos novos

    // Like rate (likes / views)
    const likeRate = likes / views;
    
    // Normalizar: 5% de like rate = score 1.0
    const score = Math.min(1, likeRate / 0.05);
    
    return score;
  }

  /**
   * Calcula score de relevância da IA (0-1)
   * Baseado em análise de qualidade e conteúdo da IA
   */
  private calculateAIRelevanceScore(video: any): number {
    let score = 0.5; // Score base

    // Pontua se tem transcrição
    if (video.transcription && video.transcription.length > 0) {
      score += 0.1;
    }

    // Pontua se tem tags da IA
    if (video.aiTags && video.aiTags.length > 0) {
      score += 0.1;
    }

    // Pontua se tem resumo
    if (video.aiSummary && video.aiSummary.length > 0) {
      score += 0.1;
    }

    // Sentimento positivo
    if (video.sentiment === 'POSITIVE') {
      score += 0.1;
    }

    // Duração ideal (1-5 minutos)
    const duration = video.duration || 0;
    if (duration >= 60 && duration <= 300) {
      score += 0.1;
    }

    return Math.min(1, score);
  }

  /**
   * Calcula score do perfil (0-1)
   * Baseado na reputação do autor
   */
  private calculateProfileScore(video: any): number {
    const profile = video.user?.profile;
    
    if (!profile) return 0.5;
    
    // Usar reputationScore do perfil (0-100) e normalizar para 0-1
    const reputationScore = profile.reputationScore || 50;
    let score = reputationScore / 100;
    
    // Boost para profissionais disponíveis para contratação
    if (profile.isAvailableForHire) {
      score += 0.1;
    }
    
    // Boost para profissionais com categoria de serviço definida
    if (profile.serviceCategory) {
      score += 0.05;
    }
    
    return Math.min(1, score);
  }

  /**
   * Calcula score final (0-100)
   */
  private calculateScore(factors: RankingFactors): number {
    const score = 
      factors.recency * FACTOR_WEIGHTS.recency +
      factors.engagement * FACTOR_WEIGHTS.engagement +
      factors.aiRelevance * FACTOR_WEIGHTS.aiRelevance +
      factors.profileScore * FACTOR_WEIGHTS.profileScore;

    // Converter para 0-100
    return Math.round(score * 100);
  }

  /**
   * Calcula data de expiração do feed item
   * Após expirar, precisa ser re-indexado
   */
  private calculateExpiryDate(): Date {
    // Expira em 7 dias (re-indexação semanal)
    const days = 7;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  /**
   * Invalida cache do feed
   */
  private async invalidateFeedCache(): Promise<void> {
    // Implementar invalidação de cache
    // Por enquanto, apenas log
    this.logger.debug('Cache do feed invalidado');
  }
}
