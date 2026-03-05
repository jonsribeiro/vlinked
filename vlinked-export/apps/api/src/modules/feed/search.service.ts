import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

export interface SearchOptions {
  query: string;
  filters?: {
    type?: string[];
    duration?: 'short' | 'medium' | 'long';
    date?: 'day' | 'week' | 'month' | 'year';
  };
  sort?: 'relevance' | 'recent' | 'popular';
  cursor?: string;
  limit: number;
}

export interface SearchResult {
  items: any[];
  nextCursor?: string;
  hasMore: boolean;
  total: number;
  facets: {
    types: { value: string; count: number }[];
    tags: { value: string; count: number }[];
    skills: { value: string; count: number }[];
  };
}

/**
 * Serviço de Busca
 * 
 * Responsabilidades:
 * - Busca full-text em títulos, descrições, transcrições
 * - Filtros por tipo, duração, data
 * - Facetas para refinamento
 * - Sugestões de busca
 * 
 * Futuro: Integração com Elasticsearch/Typesense para busca avançada
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly SEARCH_CACHE_TTL = 60; // 1 minuto

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Busca vídeos
   * 
   * Busca em:
   * - Título
   * - Descrição
   * - Tags da IA
   * - Transcrição
   * - Skills extraídas
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const cacheKey = `search:${Buffer.from(JSON.stringify(options)).toString('base64')}`;
    
    // Tentar cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const { query, filters, sort = 'relevance', cursor, limit } = options;

    // Construir where clause
    const where: any = {
      visibility: 'PUBLIC',
      status: 'READY',
    };

    // Busca full-text
    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { aiTags: { hasSome: [query] } },
        { transcription: { contains: query, mode: 'insensitive' } },
      ];
    }

    // Filtros
    if (filters?.type?.length) {
      where.type = { in: filters.type };
    }

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

    if (filters?.date) {
      const cutoffDate = this.getCutoffDate(filters.date);
      where.publishedAt = { gte: cutoffDate };
    }

    // Cursor para paginação
    if (cursor) {
      where.id = { lt: cursor };
    }

    // Ordenação
    let orderBy: any = {};
    switch (sort) {
      case 'recent':
        orderBy = { publishedAt: 'desc' };
        break;
      case 'popular':
        orderBy = { viewsCount: 'desc' };
        break;
      case 'relevance':
      default:
        orderBy = { publishedAt: 'desc' };
        break;
    }

    // Executar busca
    const [videos, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        orderBy,
        take: limit + 1,
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
      }),
      this.prisma.video.count({ where }),
    ]);

    const hasMore = videos.length > limit;
    const items = hasMore ? videos.slice(0, limit) : videos;

    // Calcular facetas
    const facets = await this.calculateFacets(query, filters);

    const result: SearchResult = {
      items: items.map(v => this.formatVideo(v)),
      nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
      hasMore,
      total,
      facets,
    };

    // Salvar cache
    await this.redis.setex(cacheKey, this.SEARCH_CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Busca por tags
   */
  async searchByTag(tag: string, options: { cursor?: string; limit: number }): Promise<SearchResult> {
    const where: any = {
      visibility: 'PUBLIC',
      status: 'READY',
      aiTags: { has: tag },
    };

    if (options.cursor) {
      where.id = { lt: options.cursor };
    }

    const [videos, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: options.limit + 1,
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
      }),
      this.prisma.video.count({ where }),
    ]);

    const hasMore = videos.length > options.limit;
    const items = hasMore ? videos.slice(0, options.limit) : videos;

    return {
      items: items.map(v => this.formatVideo(v)),
      nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
      hasMore,
      total,
      facets: { types: [], tags: [], skills: [] },
    };
  }

  /**
   * Busca por skills
   */
  async searchBySkill(skill: string, options: { cursor?: string; limit: number }): Promise<SearchResult> {
    // Buscar vídeos que mencionam a skill na transcrição ou tags
    const where: any = {
      visibility: 'PUBLIC',
      status: 'READY',
      OR: [
        { aiTags: { has: skill } },
        { transcription: { contains: skill, mode: 'insensitive' } },
      ],
    };

    if (options.cursor) {
      where.id = { lt: options.cursor };
    }

    const [videos, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: options.limit + 1,
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
      }),
      this.prisma.video.count({ where }),
    ]);

    const hasMore = videos.length > options.limit;
    const items = hasMore ? videos.slice(0, options.limit) : videos;

    return {
      items: items.map(v => this.formatVideo(v)),
      nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
      hasMore,
      total,
      facets: { types: [], tags: [], skills: [] },
    };
  }

  /**
   * Sugestões de busca (autocomplete)
   */
  async getSuggestions(query: string, limit: number = 5): Promise<string[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const cacheKey = `search:suggestions:${query.toLowerCase()}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Buscar tags que começam com a query
    const videos = await this.prisma.video.findMany({
      where: {
        visibility: 'PUBLIC',
        status: 'READY',
        aiTags: { hasSome: [query] },
      },
      select: { aiTags: true },
      take: 100,
    });

    // Extrair tags únicas que contêm a query
    const suggestions = new Set<string>();
    
    for (const video of videos) {
      for (const tag of video.aiTags) {
        if (tag.toLowerCase().includes(query.toLowerCase())) {
          suggestions.add(tag);
        }
      }
    }

    const result = Array.from(suggestions).slice(0, limit);
    
    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    
    return result;
  }

  /**
   * Busca popular (trending searches)
   */
  async getPopularSearches(limit: number = 10): Promise<string[]> {
    const cacheKey = 'search:popular';
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Retornar tags mais comuns
    const videos = await this.prisma.video.findMany({
      where: {
        visibility: 'PUBLIC',
        status: 'READY',
      },
      select: { aiTags: true },
      take: 1000,
    });

    const tagCounts = new Map<string, number>();
    
    for (const video of videos) {
      for (const tag of video.aiTags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    const result = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag]) => tag);

    await this.redis.setex(cacheKey, 3600, JSON.stringify(result));
    
    return result;
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
    };
  }

  private async calculateFacets(
    query: string,
    currentFilters?: SearchOptions['filters'],
  ): Promise<SearchResult['facets']> {
    // Buscar todos os vídeos que correspondem à query (sem filtros)
    const where: any = {
      visibility: 'PUBLIC',
      status: 'READY',
    };

    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { aiTags: { hasSome: [query] } },
      ];
    }

    const videos = await this.prisma.video.findMany({
      where,
      select: {
        type: true,
        aiTags: true,
      },
      take: 1000,
    });

    // Calcular facetas
    const typeCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();

    for (const video of videos) {
      // Types
      typeCounts.set(video.type, (typeCounts.get(video.type) || 0) + 1);

      // Tags
      for (const tag of video.aiTags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    return {
      types: Array.from(typeCounts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      tags: Array.from(tagCounts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      skills: [], // TODO: Implementar extração de skills
    };
  }

  private getCutoffDate(date: 'day' | 'week' | 'month' | 'year'): Date {
    const now = new Date();
    switch (date) {
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
