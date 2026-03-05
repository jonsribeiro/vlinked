import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

export interface ServiceDiscoveryOptions {
  category?: string;
  city?: string;
  region?: string;
  userLocation?: {
    lat: number;
    lng: number;
  };
  skills?: string[];
  cursor?: string;
  limit?: number;
}

export interface ServiceDiscoveryResult {
  items: ServiceVideoItem[];
  nextCursor?: string;
  hasMore: boolean;
  total: number;
}

export interface ServiceVideoItem {
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
    serviceCategory: string | null;
    createdAt: Date;
  };
  author: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
    headline: string | null;
    serviceCategory: string | null;
    city: string | null;
    region: string | null;
    reputationScore: number;
    isAvailableForHire: boolean;
  };
  score: number;
  factors: {
    skillMatch: number;
    locationProximity: number;
    reputation: number;
    engagement: number;
    recency: number;
  };
}

/**
 * Service Discovery Service
 * 
 * Responsável por descoberta de profissionais no feed.
 * 
 * Ranking Model (futuro):
 * - 35% Professional Reputation
 * - 25% Engagement
 * - 20% Skill Match
 * - 10% Location Distance
 * - 10% Recency
 */
@Injectable()
export class ServiceDiscoveryService {
  private readonly logger = new Logger(ServiceDiscoveryService.name);
  private readonly CACHE_TTL = 300; // 5 minutos

  // Pesos do ranking (ajustáveis)
  private readonly RANKING_WEIGHTS = {
    reputation: 0.35,
    engagement: 0.25,
    skillMatch: 0.20,
    location: 0.10,
    recency: 0.10,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Descoberta de serviços no feed
   * 
   * Retorna vídeos priorizando:
   * - skill match
   * - service category
   * - location proximity
   * - engagement
   * - recency
   */
  async discoverServices(
    userId: string | undefined,
    options: ServiceDiscoveryOptions = {},
  ): Promise<ServiceDiscoveryResult> {
    const cacheKey = this.buildCacheKey(userId, options);
    
    // Tentar cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const limit = options.limit || 20;

    // Buscar perfil do usuário para personalização
    const userProfile = userId ? await this.getUserProfile(userId) : null;

    // Construir query base
    const where = this.buildWhereClause(options);

    // Buscar feed items
    const feedItems = await this.prisma.feedItem.findMany({
      where,
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

    // Calcular scores personalizados
    const scoredItems = items.map((item) => {
      const factors = this.calculateFactors(item, userProfile, options);
      const personalizedScore = this.calculatePersonalizedScore(factors);

      return {
        ...this.mapToServiceItem(item),
        score: personalizedScore,
        factors,
      };
    });

    // Ordenar por score personalizado
    scoredItems.sort((a, b) => b.score - a.score);

    const result: ServiceDiscoveryResult = {
      items: scoredItems,
      nextCursor: hasMore
        ? Buffer.from((parseInt(options.cursor || '0') + limit).toString()).toString('base64')
        : undefined,
      hasMore,
      total: await this.prisma.feedItem.count({ where }),
    };

    // Salvar no cache
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Obter categorias de serviço disponíveis
   */
  async getServiceCategories() {
    const cacheKey = 'service:categories';
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const categories = await this.prisma.serviceCategory.findMany({
      orderBy: [
        { professionalsCount: 'desc' },
        { name: 'asc' },
      ],
    });

    await this.redis.setex(cacheKey, 3600, JSON.stringify(categories));

    return categories;
  }

  /**
   * Obter categorias populares
   */
  async getPopularCategories(limit: number = 10) {
    const categories = await this.prisma.serviceCategory.findMany({
      orderBy: [
        { professionalsCount: 'desc' },
        { videosCount: 'desc' },
      ],
      take: limit,
    });

    return categories;
  }

  /**
   * Buscar profissionais por categoria
   */
  async getProfessionalsByCategory(
    category: string,
    options: { city?: string; region?: string; cursor?: string; limit?: number } = {},
  ) {
    const limit = options.limit || 20;

    const professionals = await this.prisma.profile.findMany({
      where: {
        serviceCategory: category,
        isAvailableForHire: true,
        ...(options.city && { city: options.city }),
        ...(options.region && { region: options.region }),
      },
      orderBy: [
        { reputationScore: 'desc' },
        { followersCount: 'desc' },
      ],
      take: limit + 1,
      skip: options.cursor ? parseInt(Buffer.from(options.cursor, 'base64').toString()) : 0,
      include: {
        user: {
          select: {
            videos: {
              where: { visibility: 'PUBLIC', status: 'READY' },
              orderBy: { viewsCount: 'desc' },
              take: 3,
              select: {
                id: true,
                title: true,
                thumbnailUrl: true,
                viewsCount: true,
              },
            },
          },
        },
      },
    });

    const hasMore = professionals.length > limit;
    const items = professionals.slice(0, limit);

    return {
      data: items.map((p) => ({
        id: p.userId,
        name: p.displayName,
        avatarUrl: p.avatarUrl,
        headline: p.profession,
        serviceCategory: p.serviceCategory,
        city: p.city,
        region: p.region,
        reputationScore: p.reputationScore,
        followersCount: p.followersCount,
        videosCount: p.videosCount,
        previewVideos: p.user.videos,
      })),
      nextCursor: hasMore
        ? Buffer.from((parseInt(options.cursor || '0') + limit).toString()).toString('base64')
        : undefined,
      hasMore,
    };
  }

  /**
   * Obter sugestões de profissionais próximos
   */
  async getNearbyProfessionals(
    city: string,
    region: string,
    options: { category?: string; limit?: number } = {},
  ) {
    const limit = options.limit || 10;

    const professionals = await this.prisma.profile.findMany({
      where: {
        isAvailableForHire: true,
        city,
        region,
        ...(options.category && { serviceCategory: options.category }),
      },
      orderBy: [
        { reputationScore: 'desc' },
        { followersCount: 'desc' },
      ],
      take: limit,
      select: {
        userId: true,
        displayName: true,
        avatarUrl: true,
        profession: true,
        serviceCategory: true,
        reputationScore: true,
        followersCount: true,
      },
    });

    return professionals;
  }

  // ==================== PRIVATE METHODS ====================

  private async getUserProfile(userId: string) {
    return this.prisma.profile.findUnique({
      where: { userId },
      select: {
        skills: true,
        city: true,
        region: true,
        serviceCategory: true,
      },
    });
  }

  private buildWhereClause(options: ServiceDiscoveryOptions): any {
    const where: any = {
      expiresAt: { gt: new Date() },
    };

    // Filtro por categoria
    if (options.category) {
      where.serviceCategory = options.category;
    }

    // Filtro por localização
    if (options.city) {
      where.city = options.city;
    }
    if (options.region) {
      where.region = options.region;
    }

    return where;
  }

  private buildCacheKey(userId: string | undefined, options: ServiceDiscoveryOptions): string {
    const parts = ['service:discovery'];
    if (userId) parts.push(`user:${userId}`);
    if (options.category) parts.push(`cat:${options.category}`);
    if (options.city) parts.push(`city:${options.city}`);
    if (options.region) parts.push(`region:${options.region}`);
    if (options.cursor) parts.push(`cursor:${options.cursor}`);
    parts.push(`limit:${options.limit || 20}`);
    return parts.join(':');
  }

  private calculateFactors(
    item: any,
    userProfile: any,
    options: ServiceDiscoveryOptions,
  ): ServiceVideoItem['factors'] {
    const video = item.video;
    const profile = video.user.profile;

    // Skill Match (0-1)
    const skillMatch = this.calculateSkillMatch(userProfile, video, profile);

    // Location Proximity (0-1)
    const locationProximity = this.calculateLocationProximity(userProfile, item, options);

    // Reputation (0-1)
    const reputation = (profile?.reputationScore || 50) / 100;

    // Engagement (0-1) - baseado em likes/views ratio
    const engagement = this.calculateEngagement(video);

    // Recency (0-1)
    const recency = this.calculateRecency(video.createdAt);

    return {
      skillMatch,
      locationProximity,
      reputation,
      engagement,
      recency,
    };
  }

  private calculateSkillMatch(
    userProfile: any,
    video: any,
    profile: any,
  ): number {
    if (!userProfile?.skills?.length) return 0.5;

    const userSkills = userProfile.skills.map((s: string) => s.toLowerCase());
    const videoTags = video.aiTags.map((t: string) => t.toLowerCase());
    const profileSkills = profile?.skills?.map((s: string) => s.toLowerCase()) || [];

    // Verificar match entre skills do usuário e tags do vídeo
    const matchingTags = videoTags.filter((tag: string) =>
      userSkills.some((skill: string) => tag.includes(skill) || skill.includes(tag)),
    );

    // Verificar match entre skills do usuário e skills do profissional
    const matchingSkills = profileSkills.filter((skill: string) =>
      userSkills.some((userSkill: string) =>
        skill.includes(userSkill) || userSkill.includes(skill),
      ),
    );

    const tagScore = videoTags.length > 0 ? matchingTags.length / videoTags.length : 0;
    const skillScore = profileSkills.length > 0 ? matchingSkills.length / profileSkills.length : 0;

    return Math.min(1, (tagScore * 0.6) + (skillScore * 0.4));
  }

  private calculateLocationProximity(
    userProfile: any,
    item: any,
    options: ServiceDiscoveryOptions,
  ): number {
    // Se usuário especificou cidade na busca, dar prioridade máxima
    if (options.city && item.city === options.city) return 1.0;
    if (options.region && item.region === options.region) return 0.8;

    // Match com perfil do usuário
    if (userProfile?.city && item.city === userProfile.city) return 0.9;
    if (userProfile?.region && item.region === userProfile.region) return 0.7;

    // Mesmo país
    if (userProfile?.city || userProfile?.region) return 0.3;

    // Sem preferência de localização
    return 0.5;
  }

  private calculateEngagement(video: any): number {
    const views = video.viewsCount || 0;
    const likes = video.likesCount || 0;

    if (views === 0) return 0.1;

    // Like rate (5% = score 1.0)
    const likeRate = likes / views;
    return Math.min(1, likeRate / 0.05);
  }

  private calculateRecency(createdAt: Date): number {
    const ageInHours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
    // Decaimento exponencial: score = 1 / (1 + age/24)
    const score = 1 / (1 + ageInHours / 24);
    return Math.min(1, Math.max(0, score));
  }

  private calculatePersonalizedScore(factors: ServiceVideoItem['factors']): number {
    return (
      factors.reputation * this.RANKING_WEIGHTS.reputation +
      factors.engagement * this.RANKING_WEIGHTS.engagement +
      factors.skillMatch * this.RANKING_WEIGHTS.skillMatch +
      factors.locationProximity * this.RANKING_WEIGHTS.location +
      factors.recency * this.RANKING_WEIGHTS.recency
    );
  }

  private mapToServiceItem(item: any): Omit<ServiceVideoItem, 'score' | 'factors'> {
    const video = item.video;
    const profile = video.user.profile;

    return {
      id: item.id,
      video: {
        id: video.id,
        title: video.title,
        description: video.description,
        thumbnailUrl: video.thumbnailUrl,
        duration: video.duration,
        hlsUrl: video.processedUrl,
        viewsCount: video.viewsCount,
        likesCount: video.likesCount,
        serviceCategory: video.serviceCategory,
        createdAt: video.createdAt,
      },
      author: {
        id: video.user.id,
        name: profile?.displayName,
        avatarUrl: profile?.avatarUrl,
        headline: profile?.profession,
        serviceCategory: profile?.serviceCategory,
        city: profile?.city,
        region: profile?.region,
        reputationScore: profile?.reputationScore || 50,
        isAvailableForHire: profile?.isAvailableForHire ?? true,
      },
    };
  }
}
