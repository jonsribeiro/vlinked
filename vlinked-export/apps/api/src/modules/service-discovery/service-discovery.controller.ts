import { Controller, Get, Query, UseGuards, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ServiceDiscoveryService, ServiceDiscoveryOptions } from './service-discovery.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OptionalJwtGuard } from '../interactions/guards/optional-jwt.guard';

@ApiTags('Service Discovery')
@Controller('feed')
export class ServiceDiscoveryController {
  constructor(private readonly serviceDiscovery: ServiceDiscoveryService) {}

  /**
   * Feed de descoberta de serviços
   * 
   * Retorna vídeos priorizando:
   * - skill match
   * - service category
   * - location proximity
   * - engagement
   * - recency
   */
  @Get('services')
  @UseGuards(OptionalJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Descoberta de serviços no feed',
    description: 'Retorna vídeos de profissionais priorizando match de skills, categoria, localização e engajamento'
  })
  @ApiQuery({ name: 'category', required: false, description: 'Filtrar por categoria de serviço (ex: photography, plumbing)' })
  @ApiQuery({ name: 'city', required: false, description: 'Filtrar por cidade' })
  @ApiQuery({ name: 'region', required: false, description: 'Filtrar por estado/região' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor para paginação' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Feed de serviços' })
  async discoverServices(
    @CurrentUser('sub') userId: string | undefined,
    @Query('category') category?: string,
    @Query('city') city?: string,
    @Query('region') region?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    const options: ServiceDiscoveryOptions = {
      category,
      city,
      region,
      cursor,
      limit: Math.min(limit, 50),
    };

    return this.serviceDiscovery.discoverServices(userId, options);
  }

  /**
   * Categorias de serviço disponíveis
   */
  @Get('services/categories')
  @ApiOperation({ summary: 'Listar categorias de serviço' })
  @ApiResponse({ status: 200, description: 'Lista de categorias' })
  async getServiceCategories() {
    return this.serviceDiscovery.getServiceCategories();
  }

  /**
   * Categorias populares
   */
  @Get('services/categories/popular')
  @ApiOperation({ summary: 'Categorias de serviço mais populares' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Categorias populares' })
  async getPopularCategories(@Query('limit') limit: number = 10) {
    return this.serviceDiscovery.getPopularCategories(Math.min(limit, 20));
  }

  /**
   * Profissionais por categoria
   */
  @Get('services/categories/:category/professionals')
  @ApiOperation({ summary: 'Listar profissionais por categoria' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'region', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Profissionais da categoria' })
  async getProfessionalsByCategory(
    @Query('category') category: string,
    @Query('city') city?: string,
    @Query('region') region?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.serviceDiscovery.getProfessionalsByCategory(category, {
      city,
      region,
      cursor,
      limit: Math.min(limit, 50),
    });
  }

  /**
   * Profissionais próximos
   */
  @Get('services/nearby')
  @UseGuards(OptionalJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profissionais próximos à localização' })
  @ApiQuery({ name: 'city', required: true })
  @ApiQuery({ name: 'region', required: true })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Profissionais próximos' })
  async getNearbyProfessionals(
    @Query('city') city: string,
    @Query('region') region: string,
    @Query('category') category?: string,
    @Query('limit') limit: number = 10,
  ) {
    return this.serviceDiscovery.getNearbyProfessionals(city, region, {
      category,
      limit: Math.min(limit, 20),
    });
  }
}
