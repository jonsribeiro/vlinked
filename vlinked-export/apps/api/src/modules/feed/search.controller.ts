import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Buscar vídeos' })
  @ApiQuery({ name: 'q', required: true, description: 'Termo de busca' })
  @ApiQuery({ name: 'type', required: false, isArray: true, description: 'Filtrar por tipo' })
  @ApiQuery({ name: 'duration', required: false, enum: ['short', 'medium', 'long'] })
  @ApiQuery({ name: 'date', required: false, enum: ['day', 'week', 'month', 'year'] })
  @ApiQuery({ name: 'sort', required: false, enum: ['relevance', 'recent', 'popular'] })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Resultados da busca' })
  async search(
    @Query('q') query: string,
    @Query('type') types?: string | string[],
    @Query('duration') duration?: 'short' | 'medium' | 'long',
    @Query('date') date?: 'day' | 'week' | 'month' | 'year',
    @Query('sort') sort?: 'relevance' | 'recent' | 'popular',
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    const typeArray = types 
      ? Array.isArray(types) ? types : [types]
      : undefined;

    const result = await this.searchService.search({
      query: query || '',
      filters: {
        type: typeArray,
        duration,
        date,
      },
      sort,
      cursor,
      limit: Math.min(limit, 50),
    });

    return result;
  }

  @Get('tag/:tag')
  @ApiOperation({ summary: 'Buscar vídeos por tag' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async searchByTag(
    @Query('tag') tag: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.searchService.searchByTag(tag, {
      cursor,
      limit: Math.min(limit, 50),
    });
  }

  @Get('skill/:skill')
  @ApiOperation({ summary: 'Buscar vídeos por skill' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async searchBySkill(
    @Query('skill') skill: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.searchService.searchBySkill(skill, {
      cursor,
      limit: Math.min(limit, 50),
    });
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Sugestões de busca (autocomplete)' })
  @ApiQuery({ name: 'q', required: true, description: 'Termo parcial' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getSuggestions(
    @Query('q') query: string,
    @Query('limit') limit: number = 5,
  ) {
    const suggestions = await this.searchService.getSuggestions(
      query,
      Math.min(limit, 10),
    );
    return { data: suggestions };
  }

  @Get('popular')
  @ApiOperation({ summary: 'Buscas populares' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPopularSearches(@Query('limit') limit: number = 10) {
    const searches = await this.searchService.getPopularSearches(
      Math.min(limit, 20),
    );
    return { data: searches };
  }
}
