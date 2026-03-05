import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

export interface RecommendationOptions {
  type: 'similar' | 'related' | 'foryou';
  limit: number;
}

export interface UserPreferences {
  interests: string[];
  preferredDuration: 'short' | 'medium' | 'long' | null;
  viewedTags: string[];
  likedTags: string[];
}

/**
 * Serviço de Recomendações
 * 
 * Responsabilidades:
 * - Recomendar vídeos similares (baseado no vídeo atual)
 * - Recomendar vídeos relacionados (mesmo autor, tags similares)
 * - For You personalizado (baseado no histórico do usuário)
 * 
 * Algoritmos:
 * - Similar: TF-IDF em tags, mesma categoria
 * - Related: Mesmo autor, tags compartilhadas
 * - For You: Collaborative filtering simplificado + content-based
 */
@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);
  private readonly CACHE_TTL = 300; // 5 minutos

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Recomenda vídeos similares ao vídeo atual
   * 
   * Baseado em:
   * - Tags em comum
   * - Mesmo tipo
   * - Similaridade de conteúdo (transcrição)
   */
  async getSimilarVideos(
    videoId: string,
    options: { limit: number },
  ): Promise<any[]> {
    const cacheKey = `recommendations:similar:${videoId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Buscar vídeo de referência
    const referenceVideo = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        type: true,
        aiTags: true,
        userId: true,
      },
    });

    if (!referenceVideo) {
      return [];
    }

    // Buscar vídeos com tags similares
    const similarVideos = await this.prisma.video.findMany({
      where: {
        id: { not: videoId },
        visibility: 'PUBLIC',
        status: 'READY',
        OR: [
          { type: referenceVideo.type },
          { aiTags: { hasSome: referenceVideo.aiTags } },
        ],
      },
      take: options.limit * 2, // Pegar mais para ordenar
      include: {
        user: {
          include: {
            profile: {
              select: {
                displayName: true,
                avatarUrl: true,
                headline: true,
              },
            },
          },
        },
        feedItems: {
          select: {
            score: true,
          },
        },
      },
    });

    // Calcular score de similaridade
    const scoredVideos = similarVideos.map(video => {
      const commonTags = video.aiTags.filter(tag =>
        referenceVideo.aiTags.includes(tag),
      );
      const tagScore = commonTags.length / Math.max(video.aiTags.length, referenceVideo.aiTags.length);
      const typeScore = video.type === referenceVideo.type ? 0.3 : 0;
      const feedScore = video.feedItems?.[0]?.score || 0;

      return {
        ...video,
        similarityScore: tagScore * 0.5 + typeScore + feedScore * 0.2,
        commonTags,
      };
    });

    // Ordenar por similaridade
    const sortedVideos = scoredVideos
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, options.limit);

    const result = sortedVideos.map(v => this.formatVideo(v));

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Recomenda vídeos relacionados
   * 
   * Baseado em:
   * - Mesmo autor
   * - Tags relacionadas
   * - Popularidade
   */
  async getRelatedVideos(
    videoId: string,
    options: { limit: number },
  ): Promise<any[]> {
    const cacheKey = `recommendations:related:${videoId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const referenceVideo = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        userId: true,
        aiTags: true,
      },
    });

    if (!referenceVideo) {
      return [];
    }

    // Buscar vídeos do mesmo autor
    const sameAuthorVideos = await this.prisma.video.findMany({
      where: {
        id: { not: videoId },
        userId: referenceVideo.userId,
        visibility: 'PUBLIC',
        status: 'READY',
      },
      take: Math.ceil(options.limit / 2),
      include: {
        user: {
          include: {
            profile: {
              select: {
                displayName: true,
                avatarUrl: true,
                headline: true,
              },
            },
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
    });

    // Buscar vídeos com tags relacionadas
    const relatedTagVideos = await this.prisma.video.findMany({
      where: {
        id: { not: videoId },
        userId: { not: referenceVideo.userId },
        visibility: 'PUBLIC',
        status: 'READY',
        aiTags: { hasSome: referenceVideo.aiTags },
      },
      take: options.limit,
      include: {
        user: {
          include: {
            profile: {
              select: {
                displayName: true,
                avatarUrl: true,
                headline: true,
              },
            },
          },
        },
        feedItems: {
          select: {
            score: true,
            clicks: true,
          },
        },
      },
    });

    // Combinar e ordenar
    const combined = [
      ...sameAuthorVideos.map(v => ({ ...v, source: 'same_author' })),
      ...relatedTagVideos.map(v => ({ ...v, source: 'related_tags' })),
    ];

    // Remover duplicatas
    const unique = combined.filter(
      (v, i, a) => a.findIndex(t => t.id === v.id) === i,
    );

    // Ordenar por popularidade
    const sorted = unique
      .sort((a, b) => {
        const scoreA = (a.feedItems?.[0]?.score || 0) + (a.feedItems?.[0]?.clicks || 0) * 0.1;
        const scoreB = (b.feedItems?.[0]?.score || 0) + (b.feedItems?.[0]?.clicks || 0) * 0.1;
        return scoreB - scoreA;
      })
      .slice(0, options.limit);

    const result = sorted.map(v => this.formatVideo(v));

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Recomendações personalizadas "For You"
   * 
   * Baseado no histórico do usuário:
   * - Tags de vídeos assistidos
   * - Tags de vídeos curtidos
   * - Criadores seguidos
   */
  async getPersonalizedRecommendations(
    userId: string,
    options: { limit: number },
  ): Promise<any[]> {
    const cacheKey = `recommendations:foryou:${userId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Extrair preferências do usuário
    const preferences = await this.extractUserPreferences(userId);

    if (preferences.interests.length === 0) {
      // Sem histórico - retornar trending
      return this.getFallbackRecommendations(options.limit);
    }

    // Construir query baseada nas preferências
    const where: any = {
      visibility: 'PUBLIC',
      status: 'READY',
      OR: [],
    };

    // Preferências de tags
    if (preferences.interests.length > 0) {
      where.OR.push({ aiTags: { hasSome: preferences.interests } });
    }

    // Preferência de duração
    if (preferences.preferredDuration) {
      switch (preferences.preferredDuration) {
        case 'short':
          where.duration = { lte: 60 };
          break;
        case 'medium':
          where.duration = { gt: 60, lte: 300 };
          break;
        case 'long':
          where.duration = { gt: 300 };
          break;
      }
    }

    // Buscar vídeos recomendados
    const videos = await this.prisma.video.findMany({
      where,
      take: options.limit * 2,
      include: {
        user: {
          include: {
            profile: {
              select: {
                displayName: true,
                avatarUrl: true,
                headline: true,
              },
            },
          },
        },
        feedItems: {
          select: {
            score: true,
          },
        },
      },
    });

    // Calcular score de personalização
    const scoredVideos = videos.map(video => {
      const tagMatches = video.aiTags.filter(tag =>
        preferences.interests.includes(tag),
      ).length;
      
      const likedTagMatches = video.aiTags.filter(tag =>
        preferences.likedTags.includes(tag),
      ).length;

      const personalizationScore = 
        (tagMatches / video.aiTags.length) * 0.4 +
        (likedTagMatches / video.aiTags.length) * 0.3 +
        (video.feedItems?.[0]?.score || 0) * 0.3;

      return {
        ...video,
        personalizationScore,
      };
    });

    // Ordenar por score de personalização
    const sortedVideos = scoredVideos
      .sort((a, b) => b.personalizationScore - a.personalizationScore)
      .slice(0, options.limit);

    const result = sortedVideos.map(v => this.formatVideo(v));

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Extrai preferências do usuário baseado no histórico
   */
  private async extractUserPreferences(userId: string): Promise<UserPreferences> {
    // Buscar histórico de visualizações
    const viewedVideos = await this.prisma.video.findMany({
      where: {
        views: {
          some: {
            userId,
          },
        },
      },
      select: {
        aiTags: true,
        duration: true,
      },
      take: 50,
    });

    // Buscar vídeos curtidos
    const likedVideos = await this.prisma.video.findMany({
      where: {
        likes: {
          some: {
            userId,
          },
        },
      },
      select: {
        aiTags: true,
      },
      take: 20,
    });

    // Extrair tags mais comuns
    const tagCounts = new Map<string, number>();
    const durationCounts = { short: 0, medium: 0, long: 0 };

    for (const video of viewedVideos) {
      // Contar tags
      for (const tag of video.aiTags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }

      // Contar durações
      if (video.duration) {
        if (video.duration <= 60) durationCounts.short++;
        else if (video.duration <= 300) durationCounts.medium++;
        else durationCounts.long++;
      }
    }

    // Extrair tags curtidas
    const likedTags = new Set<string>();
    for (const video of likedVideos) {
      for (const tag of video.aiTags) {
        likedTags.add(tag);
      }
    }

    // Top tags
    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);

    // Duração preferida
    const preferredDuration = Object.entries(durationCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] as UserPreferences['preferredDuration'];

    return {
      interests: topTags,
      preferredDuration,
      viewedTags: Array.from(tagCounts.keys()),
      likedTags: Array.from(likedTags),
    };
  }

  /**
   * Recomendações fallback (sem histórico)
   */
  private async getFallbackRecommendations(limit: number): Promise<any[]> {
    const videos = await this.prisma.video.findMany({
      where: {
        visibility: 'PUBLIC',
        status: 'READY',
      },
      take: limit,
      include: {
        user: {
          include: {
            profile: {
              select: {
                displayName: true,
                avatarUrl: true,
                headline: true,
              },
            },
          },
        },
        feedItems: {
          select: {
            score: true,
          },
        },
      },
      orderBy: [
        { feedItems: { _count: 'desc' } },
        { publishedAt: 'desc' },
      ],
    });

    return videos.map(v => this.formatVideo(v));
  }

  // ==================== Private Methods ====================

  private formatVideo(video: any): any {
    return {
      id: video.id,
      title: video.title,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl,
      duration: video.duration,
      processedUrl: video.processedUrl,
      type: video.type,
      viewsCount: video.viewsCount,
      likesCount: video.likesCount,
      publishedAt: video.publishedAt,
      user: video.user,
      score: video.feedItems?.[0]?.score,
      source: video.source,
      commonTags: video.commonTags,
    };
  }
}
