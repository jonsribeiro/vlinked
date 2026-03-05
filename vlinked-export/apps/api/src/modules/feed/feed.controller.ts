import { Controller, Get, Query, UseGuards, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { FeedService, FeedType } from './feed.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Feed')
@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Feed principal personalizado' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor para paginação' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Feed de vídeos' })
  async getFeed(
    @CurrentUser('sub') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.feedService.getPersonalizedFeed(userId, {
      cursor,
      limit: Math.min(limit, 50),
    });
  }

  @Get('for-you')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Feed "Para Você" (recomendações)' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getForYou(
    @CurrentUser('sub') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.feedService.getForYouFeed(userId, {
      cursor,
      limit: Math.min(limit, 50),
    });
  }

  @Get('following')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Feed de quem você segue' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFollowing(
    @CurrentUser('sub') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.feedService.getFollowingFeed(userId, {
      cursor,
      limit: Math.min(limit, 50),
    });
  }

  @Get('trending')
  @ApiOperation({ summary: 'Vídeos em alta' })
  @ApiQuery({ name: 'timeframe', required: false, enum: ['day', 'week', 'month'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTrending(
    @Query('timeframe') timeframe: 'day' | 'week' | 'month' = 'week',
    @Query('limit') limit: number = 20,
  ) {
    return this.feedService.getTrending({
      timeframe,
      limit: Math.min(limit, 50),
    });
  }

  @Get('recent')
  @ApiOperation({ summary: 'Vídeos mais recentes' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getRecent(
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.feedService.getRecent({
      cursor,
      limit: Math.min(limit, 50),
    });
  }

  @Get('by-tag/:tag')
  @ApiOperation({ summary: 'Vídeos por tag' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getByTag(
    @Query('tag') tag: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.feedService.getByTag(tag, {
      cursor,
      limit: Math.min(limit, 50),
    });
  }

  @Get('related/:videoId')
  @ApiOperation({ summary: 'Vídeos relacionados' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getRelated(
    @Query('videoId') videoId: string,
    @Query('limit') limit: number = 10,
  ) {
    return this.feedService.getRelatedVideos(videoId, {
      limit: Math.min(limit, 20),
    });
  }
}
