import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { DiscoveryService } from './discovery.service';

@ApiTags('Discovery')
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('trending')
  @ApiOperation({ summary: 'Conteúdo em alta' })
  @ApiResponse({ status: 200, description: 'Dados de trending' })
  async getTrending() {
    return this.discoveryService.getTrending();
  }

  @Get('trending/videos')
  @ApiOperation({ summary: 'Vídeos em alta' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Vídeos em alta' })
  async getTrendingVideos(@Query('limit') limit: number = 10) {
    const videos = await this.discoveryService.getTrendingVideos(Math.min(limit, 20));
    return { data: videos };
  }

  @Get('trending/hashtags')
  @ApiOperation({ summary: 'Hashtags em alta' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Hashtags populares' })
  async getTrendingHashtags(@Query('limit') limit: number = 10) {
    const hashtags = await this.discoveryService.getTrendingHashtags(Math.min(limit, 20));
    return { data: hashtags };
  }

  @Get('trending/creators')
  @ApiOperation({ summary: 'Criadores em ascensão' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Criadores populares' })
  async getTrendingCreators(@Query('limit') limit: number = 10) {
    const creators = await this.discoveryService.getTrendingCreators(Math.min(limit, 20));
    return { data: creators };
  }

  @Get('categories')
  @ApiOperation({ summary: 'Explorar por categoria' })
  @ApiResponse({ status: 200, description: 'Categorias disponíveis' })
  async getCategories() {
    const categories = await this.discoveryService.getCategories();
    return { data: categories };
  }

  @Get('onboarding')
  @ApiOperation({ summary: 'Recomendações para onboarding' })
  @ApiResponse({ status: 200, description: 'Conteúdo recomendado para novos usuários' })
  async getOnboardingRecommendations() {
    return this.discoveryService.getOnboardingRecommendations();
  }
}
