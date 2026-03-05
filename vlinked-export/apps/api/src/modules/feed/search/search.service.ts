import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';

export interface SearchOptions {
  query: string;
  type?: 'all' | 'videos' | 'users' | 'tags';
  filters?: {
    duration?: 'short' | 'medium' | 'long';
    date?: 'day' | 'week' | 'month' | 'year';
    sort?: 'relevance' | 'recent' | 'popular';
  };
  cursor?: string;
  limit?: number;
}

export interface SearchResult {
  videos: SearchVideoItem[];
  users: SearchUserItem[];
  tags: SearchTagItem[];
  total: number;
  nextCursor?: string;
  hasMore: boolean;
}

export interface SearchVideoItem {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  viewsCount: number;
  likesCount: number;
  author: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  };
  publishedAt: Date;
  relevance: number;
}

export interface SearchUserItem {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  headline: string | null;
  verified: boolean;
  followersCount: number;
  videosCount: number;
  relevance: number;
}

export interface SearchTagItem {
  name: string;
  count: number;
}

/**
 * Serviço de Busca
 * 
 * Implementação atual: Busca via Prisma (PostgreSQL)
 * Futuro: Elasticsearch/OpenSearch para busca full-text avançada
 * 
 * Features:
 * - Busca em títulos, descrições, tags, transcrições
 * - Filtros por duração, data, ordenação
 * - Busca de usuários
 * - Sugestões de tags
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly SEARCH_CACHE_TTL = 300; // 5 minutos

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Busca principal
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const cacheKey = `search:${options.query}:${options.type}:${JSON.stringify(options.filters)}:${options.cursor || 'first'}`;
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const limit = options.limit || 20;
    const skip = options.cursor ? parseInt(Buffer.from(options.cursor, 'base64').toString()) : 0;

    // Buscar vídeos
    const videos = await this.searchVideos(options, limit, skip);

    // Buscar usuários (se tipo for 'all' ou 'users')
    const users = options.type === 'videos' ? [] : await this.searchUsers(options.query, 5);

    // Buscar tags relacionadas
    const tags = await this.searchTags(options.query, 10);

    const hasMore = videos.length > limit;
    const videoItems = videos.slice(0, limit);

    const result: SearchResult = {
      videos: videoItems,
      users,
      tags,
      total: videoItems.length + users.length,
      nextCursor: hasMore
        ? Buffer.from((skip + limit).toString()).toString('base64')
        : undefined,
      hasMore,
    };

    await this.redis.setex(cacheKey, this.SEARCH_CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Sugestões de busca (autocomplete)
   */
  async getSuggestions(query: string, limit: number = 5): Promise<string[]> {
    if (query.length < 2) return [];

    const cacheKey = `search:suggestions:${query}`;
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Buscar tags que começam com a query
    const tags = await this.prisma.video.findMany({
      where: {
        aiTags: {
          hasSome: [query],
        },
      },
      select: {
        aiTags: true,
      },
      take: 50,
    });

    // Extrair e contar tags relevantes
    const tagCounts = new Map<string, number>();
    for (const video of tags) {
      for (const tag of video.aiTags) {
        if (tag.toLowerCase().includes(query.toLowerCase())) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }
    }

    // Ordenar por frequência
    const suggestions = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag]) => tag);

    await this.redis.setex(cacheKey, 300, JSON.stringify(suggestions));

    return suggestions;
  }

  /**
   * Busca popular/trending searches
   */
  async getTrendingSearches(limit: number = 10): Promise<string[]> {
    const cacheKey = 'search:trending';
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Buscar tags mais usadas nos últimos 7 dias
    const videos = await this.prisma.video.findMany({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        aiTags: true,
      },
      take: 100,
    });

    const tagCounts = new Map<string, number>();
    for (const video of videos) {
      for (const tag of video.aiTags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    const trending = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag]) => tag);

    await this.redis.setex(cacheKey, 3600, JSON.stringify(trending));

    return trending;
  }

  // ==================== Private Methods ====================

  private async searchVideos(
    options: SearchOptions,
    limit: number,
    skip: number,
  ): Promise<SearchVideoItem[]> {
    const { query, filters } = options;

    // Construir where clause
    const where: any = {
      visibility: 'PUBLIC',
      status: 'READY',
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { aiTags: { hasSome: [query] } },
        { transcription: { contains: query, mode: 'insensitive' } },
      ],
    };

    // Filtro de duração
    if (filters?.duration) {
      switch (filters.duration) {
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

    // Filtro de data
    if (filters?.date) {
      const timeframeDate = this.getTimeframeDate(filters.date);
      where.publishedAt = { gte: timeframeDate };
    }

    // Ordenação
    let orderBy: any = {};
    switch (filters?.sort) {
      case 'recent':
        orderBy = { publishedAt: 'desc' };
        break;
      case 'popular':
        orderBy = [{ viewsCount: 'desc' }, { likesCount: 'desc' }];
        break;
      case 'relevance':
      default:
        orderBy = { viewsCount: 'desc' };
    }

    const videos = await this.prisma.video.findMany({
      where,
      orderBy,
      take: limit + 1,
      skip,
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
      description: video.description,
      thumbnailUrl: video.thumbnailUrl,
      duration: video.duration,
      viewsCount: video.viewsCount,
      likesCount: video.likesCount,
      author: {
        id: video.user.id,
        name: video.user.profile?.name,
        avatarUrl: video.user.profile?.avatarUrl,
      },
      publishedAt: video.publishedAt || video.createdAt,
      relevance: this.calculateRelevance(video, query),
    }));
  }

  private async searchUsers(query: string, limit: number): Promise<SearchUserItem[]> {
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { profile: { name: { contains: query, mode: 'insensitive' } } },
          { profile: { headline: { contains: query, mode: 'insensitive' } } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      include: {
        profile: true,
        _count: {
          select: {
            videos: true,
          },
        },
      },
    });

    return users.map((user) => ({
      id: user.id,
      name: user.profile?.name,
      avatarUrl: user.profile?.avatarUrl,
      headline: user.profile?.headline,
      verified: user.profile?.verified || false,
      followersCount: 0, // TODO: Implementar followers
      videosCount: user._count.videos,
      relevance: 1,
    }));
  }

  private async searchTags(query: string, limit: number): Promise<SearchTagItem[]> {
    // Buscar vídeos que contêm a query nas tags
    const videos = await this.prisma.video.findMany({
      where: {
        aiTags: {
          hasSome: [query],
        },
      },
      select: {
        aiTags: true,
      },
      take: 100,
    });

    const tagCounts = new Map<string, number>();
    for (const video of videos) {
      for (const tag of video.aiTags) {
        if (tag.toLowerCase().includes(query.toLowerCase())) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }
    }

    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }

  private calculateRelevance(video: any, query: string): number {
    let score = 0;
    const lowerQuery = query.toLowerCase();
    const lowerTitle = video.title?.toLowerCase() || '';
    const lowerDesc = video.description?.toLowerCase() || '';

    // Título contém query (maior peso)
    if (lowerTitle.includes(lowerQuery)) {
      score += 10;
    }

    // Tags contêm query
    if (video.aiTags.some((tag: string) => tag.toLowerCase().includes(lowerQuery))) {
      score += 5;
    }

    // Descrição contém query
    if (lowerDesc.includes(lowerQuery)) {
      score += 3;
    }

    // Transcrição contém query
    if (video.transcription?.toLowerCase().includes(lowerQuery)) {
      score += 2;
    }

    // Boost por engajamento
    score += Math.log(video.viewsCount + 1) * 0.5;
    score += Math.log(video.likesCount + 1) * 0.3;

    return score;
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
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }
}
