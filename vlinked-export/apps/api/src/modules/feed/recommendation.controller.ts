import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RecommendationService } from './recommendation.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Recommendations')
@Controller('recommendations')
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}

  @Get('similar/:videoId')
  @ApiOperation({ summary: 'Vídeos similares ao vídeo atual' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Vídeos similares' })
  async getSimilarVideos(
    @Param('videoId') videoId: string,
    @Query('limit') limit: number = 10,
  ) {
    const videos = await this.recommendationService.getSimilarVideos(videoId, {
      limit: Math.min(limit, 20),
    });
    return { data: videos };
  }

  @Get('related/:videoId')
  @ApiOperation({ summary: 'Vídeos relacionados ao vídeo atual' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Vídeos relacionados' })
  async getRelatedVideos(
    @Param('videoId') videoId: string,
    @Query('limit') limit: number = 10,
  ) {
    const videos = await this.recommendationService.getRelatedVideos(videoId, {
      limit: Math.min(limit, 20),
    });
    return { data: videos };
  }

  @Get('foryou')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recomendações personalizadas (For You)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Recomendações personalizadas' })
  async getForYou(
    @CurrentUser('sub') userId: string,
    @Query('limit') limit: number = 20,
  ) {
    const videos = await this.recommendationService.getPersonalizedRecommendations(
      userId,
      { limit: Math.min(limit, 50) },
    );
    return { data: videos };
  }
}
