import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';

export interface TrendingData {
  videos: TrendingVideo[];
  hashtags: TrendingHashtag[];
  creators: TrendingCreator[];
  topics: TrendingTopic[];
}

export interface TrendingVideo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  author: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  };
  viewsCount: number;
  likesCount: number;
  growthRate: number; // Taxa de crescimento nas últimas 24h
}

export interface TrendingHashtag {
  name: string;
  count: number;
  growthRate: number;
}

export interface TrendingCreator {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  headline: string | null;
  followersCount: number;
  videosCount: number;
  growthRate: number;
}

export interface TrendingTopic {
  name: string;
  count: number;
  relatedTags: string[];
}

export interface CategoryContent {
  name: string;
  slug: string;
  icon: string;
  videoCount: number;
  previewVideos: PreviewVideo[];
}

export interface PreviewVideo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  author: {
    name: string | null;
    avatarUrl: string | null;
  };
}

/**
 * Serviço de Descoberta
 * 
 * Responsabilidades:
 * - Conteúdo em alta (trending)
 * - Hashtags populares
 * - Criadores em ascensão
 * - Tópicos populares
 * - Explorar por categoria
 * - Recomendações de conteúdo
 */
@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);
  private readonly TRENDING_CACHE_TTL = 600; // 10 minutos
  private readonly CATEGORIES_CACHE_TTL = 3600; // 1 hora

  // Categorias pré-definidas
  private readonly CATEGORIES = [
    { name: 'Tecnologia', slug: 'technology', icon: '💻' },
    { name: 'Carreira', slug: 'career', icon: '💼' },
    { name: 'Design', slug: 'design', icon: '🎨' },
    { name: 'Marketing', slug: 'marketing', icon: '📈' },
    { name: 'Negócios', slug: 'business', icon: '💰' },
    { name: 'Educação', slug: 'education', icon: '📚' },
    { name: 'Criatividade', slug: 'creativity', icon: '✨' },
    { name: 'Liderança', slug: 'leadership', icon: '👑' },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Dados completos de trending
   */
  async getTrending(): Promise<TrendingData> {
    const cacheKey = 'discovery:trending';
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const [videos, hashtags, creators, topics] = await Promise.all([
      this.getTrendingVideos(10),
      this.getTrendingHashtags(10),
      this.getTrendingCreators(10),
      this.getTrendingTopics(10),
    ]);

    const result: TrendingData = {
      videos,
      hashtags,
      creators,
      topics,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), this.TRENDING_CACHE_TTL);

    return result;
  }

  /**
   * Vídeos em alta (crescimento nas últimas 24h)
   */
  async getTrendingVideos(limit: number = 10): Promise<TrendingVideo[]> {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // Buscar vídeos com crescimento de views nas últimas 24h
    const videos = await this.prisma.video.findMany({
      where: {
        visibility: 'PUBLIC',
        status: 'READY',
        publishedAt: { gte: last48h },
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

    return videos.map((video) => ({
      id: video.id,
      title: video.title,
      thumbnailUrl: video.thumbnailUrl,
      author: {
        id: video.user.id,
        name: video.user.profile?.name,
        avatarUrl: video.user.profile?.avatarUrl,
      },
      viewsCount: video.viewsCount,
      likesCount: video.likesCount,
      growthRate: Math.random() * 100 + 50, // TODO: Calcular crescimento real
    }));
  }

  /**
   * Hashtags em alta
   */
  async getTrendingHashtags(limit: number = 10): Promise<TrendingHashtag[]> {
    const last7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last14days = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Buscar tags dos últimos 7 dias
    const recentVideos = await this.prisma.video.findMany({
      where: {
        publishedAt: { gte: last7days },
        visibility: 'PUBLIC',
      },
      select: { aiTags: true },
    });

    // Buscar tags dos 7 dias anteriores (para comparar)
    const previousVideos = await this.prisma.video.findMany({
      where: {
        publishedAt: { gte: last14days, lt: last7days },
        visibility: 'PUBLIC',
      },
      select: { aiTags: true },
    });

    // Contar tags
    const recentCounts = this.countTags(recentVideos);
    const previousCounts = this.countTags(previousVideos);

    // Calcular crescimento
    const hashtags = Array.from(recentCounts.entries())
      .map(([name, count]) => {
        const previous = previousCounts.get(name) || 1;
        const growthRate = ((count - previous) / previous) * 100;
        return { name, count, growthRate };
      })
      .sort((a, b) => b.growthRate - a.growthRate)
      .slice(0, limit);

    return hashtags;
  }

  /**
   * Criadores em ascensão
   */
  async getTrendingCreators(limit: number = 10): Promise<TrendingCreator[]> {
    const last7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Buscar criadores com vídeos recentes populares
    const creators = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        videos: {
          some: {
            publishedAt: { gte: last7days },
            visibility: 'PUBLIC',
          },
        },
      },
      include: {
        profile: true,
        _count: {
          select: { videos: true },
        },
      },
      take: limit * 2, // Pegar mais para ordenar
    });

    // Buscar views totais dos últimos 7 dias para cada criador
    const creatorsWithStats = await Promise.all(
      creators.map(async (creator) => {
        const stats = await this.prisma.video.aggregate({
          where: {
            userId: creator.id,
            publishedAt: { gte: last7days },
            visibility: 'PUBLIC',
          },
          _sum: {
            viewsCount: true,
            likesCount: true,
          },
        });

        return {
          ...creator,
          totalViews: stats._sum.viewsCount || 0,
          totalLikes: stats._sum.likesCount || 0,
        };
      }),
    );

    // Ordenar por engajamento total
    return creatorsWithStats
      .sort((a, b) => (b.totalViews + b.totalLikes * 10) - (a.totalViews + a.totalLikes * 10))
      .slice(0, limit)
      .map((creator) => ({
        id: creator.id,
        name: creator.profile?.name,
        avatarUrl: creator.profile?.avatarUrl,
        headline: creator.profile?.headline,
        followersCount: 0, // TODO: Implementar followers
        videosCount: creator._count.videos,
        growthRate: Math.random() * 50 + 20, // TODO: Calcular crescimento real
      }));
  }

  /**
   * Tópicos populares
   */
  async getTrendingTopics(limit: number = 10): Promise<TrendingTopic[]> {
    const last7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const videos = await this.prisma.video.findMany({
      where: {
        publishedAt: { gte: last7days },
        visibility: 'PUBLIC',
      },
      select: {
        aiTags: true,
        aiSummary: true,
      },
      take: 100,
    });

    // Agrupar por tópicos principais (usando tags como proxy)
    const topicCounts = new Map<string, { count: number; related: Set<string> }>();

    for (const video of videos) {
      for (const tag of video.aiTags) {
        if (!topicCounts.has(tag)) {
          topicCounts.set(tag, { count: 0, related: new Set() });
        }
        const topic = topicCounts.get(tag)!;
        topic.count++;
        video.aiTags.forEach((t) => {
          if (t !== tag) topic.related.add(t);
        });
      }
    }

    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([name, data]) => ({
        name,
        count: data.count,
        relatedTags: Array.from(data.related).slice(0, 5),
      }));
  }

  /**
   * Explorar por categoria
   */
  async getCategories(): Promise<CategoryContent[]> {
    const cacheKey = 'discovery:categories';
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const categories = await Promise.all(
      this.CATEGORIES.map(async (cat) => {
        const videoCount = await this.prisma.video.count({
          where: {
            visibility: 'PUBLIC',
            status: 'READY',
            aiTags: { hasSome: [cat.slug, cat.name.toLowerCase()] },
          },
        });

        const previewVideos = await this.prisma.video.findMany({
          where: {
            visibility: 'PUBLIC',
            status: 'READY',
            aiTags: { hasSome: [cat.slug, cat.name.toLowerCase()] },
          },
          orderBy: { viewsCount: 'desc' },
          take: 3,
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        });

        return {
          ...cat,
          videoCount,
          previewVideos: previewVideos.map((v) => ({
            id: v.id,
            title: v.title,
            thumbnailUrl: v.thumbnailUrl,
            author: {
              name: v.user.profile?.name,
              avatarUrl: v.user.profile?.avatarUrl,
            },
          })),
        };
      }),
    );

    await this.redis.set(cacheKey, JSON.stringify(categories), this.CATEGORIES_CACHE_TTL);

    return categories;
  }

  /**
   * Recomendações para novo usuário (onboarding)
   */
  async getOnboardingRecommendations(): Promise<{
    popularTags: string[];
    topCreators: TrendingCreator[];
    featuredVideos: TrendingVideo[];
  }> {
    const cacheKey = 'discovery:onboarding';
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const [hashtags, creators, videos] = await Promise.all([
      this.getTrendingHashtags(15),
      this.getTrendingCreators(10),
      this.getTrendingVideos(10),
    ]);

    const result = {
      popularTags: hashtags.map((h) => h.name),
      topCreators: creators,
      featuredVideos: videos,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), this.TRENDING_CACHE_TTL);

    return result;
  }

  // ==================== Private Methods ====================

  private countTags(videos: { aiTags: string[] }[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const video of videos) {
      for (const tag of video.aiTags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return counts;
  }
}
