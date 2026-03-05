import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Analytics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('videos/:id')
  @ApiOperation({ summary: 'Analytics de um vídeo' })
  @ApiQuery({ name: 'timeframe', required: false, enum: ['day', 'week', 'month', 'year'] })
  @ApiResponse({ status: 200, description: 'Analytics do vídeo' })
  async getVideoAnalytics(
    @Param('id') videoId: string,
    @Query('timeframe') timeframe: 'day' | 'week' | 'month' | 'year' = 'week',
  ) {
    return this.analyticsService.getVideoAnalytics(videoId, timeframe);
  }

  @Get('profiles/:id')
  @ApiOperation({ summary: 'Analytics de um perfil' })
  @ApiResponse({ status: 200, description: 'Analytics do perfil' })
  async getProfileAnalytics(@Param('id') userId: string) {
    return this.analyticsService.getProfileAnalytics(userId);
  }

  @Get('me/videos')
  @ApiOperation({ summary: 'Analytics dos vídeos do usuário logado' })
  @ApiQuery({ name: 'timeframe', required: false, enum: ['day', 'week', 'month', 'year'] })
  async getMyVideosAnalytics(
    @CurrentUser('sub') userId: string,
    @Query('timeframe') timeframe: 'day' | 'week' | 'month' | 'year' = 'week',
  ) {
    return this.analyticsService.getProfileAnalytics(userId);
  }

  @Get('me/overview')
  @ApiOperation({ summary: 'Visão geral de analytics do usuário' })
  async getMyOverview(@CurrentUser('sub') userId: string) {
    const analytics = await this.analyticsService.getProfileAnalytics(userId);
    
    return {
      data: {
        overview: analytics,
        insights: {
          engagementRate: analytics.engagementRate,
          avgViewsPerVideo: analytics.videosCount > 0 
            ? Math.round(analytics.totalViews / analytics.videosCount) 
            : 0,
          followerGrowth: 0, // TODO: Calcular crescimento
        },
      },
    };
  }

  @Get('reports/engagement')
  @ApiOperation({ summary: 'Relatório de engajamento' })
  @ApiQuery({ name: 'entityType', required: true, enum: ['video', 'profile'] })
  @ApiQuery({ name: 'entityId', required: true })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getEngagementReport(
    @Query('entityType') entityType: 'video' | 'profile',
    @Query('entityId') entityId: string,
    @Query('days') days: number = 7,
  ) {
    return this.analyticsService.getEngagementReport(entityType, entityId, days);
  }
}
