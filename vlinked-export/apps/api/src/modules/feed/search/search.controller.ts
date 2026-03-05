import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Busca de conteúdo' })
  @ApiQuery({ name: 'q', required: true, description: 'Termo de busca' })
  @ApiQuery({ name: 'type', required: false, enum: ['all', 'videos', 'users', 'tags'] })
  @ApiQuery({ name: 'duration', required: false, enum: ['short', 'medium', 'long'] })
  @ApiQuery({ name: 'date', required: false, enum: ['day', 'week', 'month', 'year'] })
  @ApiQuery({ name: 'sort', required: false, enum: ['relevance', 'recent', 'popular'] })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Resultados da busca' })
  async search(
    @Query('q') query: string,
    @Query('type') type: 'all' | 'videos' | 'users' | 'tags' = 'all',
    @Query('duration') duration?: 'short' | 'medium' | 'long',
    @Query('date') date?: 'day' | 'week' | 'month' | 'year',
    @Query('sort') sort: 'relevance' | 'recent' | 'popular' = 'relevance',
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.searchService.search({
      query,
      type,
      filters: { duration, date, sort },
      cursor,
      limit: Math.min(limit, 50),
    });
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Sugestões de busca (autocomplete)' })
  @ApiQuery({ name: 'q', required: true, description: 'Termo parcial' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Sugestões' })
  async getSuggestions(
    @Query('q') query: string,
    @Query('limit') limit: number = 5,
  ) {
    const suggestions = await this.searchService.getSuggestions(query, Math.min(limit, 10));
    return { data: suggestions };
  }

  @Get('trending')
  @ApiOperation({ summary: 'Buscas em alta' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Buscas populares' })
  async getTrendingSearches(@Query('limit') limit: number = 10) {
    const trending = await this.searchService.getTrendingSearches(Math.min(limit, 20));
    return { data: trending };
  }
}
