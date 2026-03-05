import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  Query,
  Ip,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LikeService } from './like.service';
import { CommentService } from './comment.service';
import { FollowService } from './follow.service';
import { ShareService } from './share.service';
import { ViewService } from './view.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtGuard } from './guards/optional-jwt.guard';
import {
  LikeResponseDto,
  CreateCommentDto,
  CommentsListResponseDto,
  FollowResponseDto,
  ShareVideoDto,
  ShareResponseDto,
  TrackViewDto,
  ViewResponseDto,
  ViewMetricsDto,
  SharePlatform,
} from './dto/interactions.dto';

@ApiTags('Interactions')
@Controller()
export class InteractionsController {
  constructor(
    private readonly likeService: LikeService,
    private readonly commentService: CommentService,
    private readonly followService: FollowService,
    private readonly shareService: ShareService,
    private readonly viewService: ViewService,
  ) {}

  // ==================== LIKES ====================

  @Post('videos/:id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Curtir vídeo' })
  @ApiResponse({ status: 200, type: LikeResponseDto })
  async likeVideo(
    @Param('id') videoId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<LikeResponseDto> {
    return this.likeService.likeVideo(userId, videoId);
  }

  @Delete('videos/:id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Descurtir vídeo' })
  @ApiResponse({ status: 200, type: LikeResponseDto })
  async unlikeVideo(
    @Param('id') videoId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<LikeResponseDto> {
    return this.likeService.unlikeVideo(userId, videoId);
  }

  @Get('videos/:id/likes')
  @ApiOperation({ summary: 'Listar curtidas do vídeo' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getVideoLikes(
    @Param('id') videoId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.likeService.getVideoLikes(videoId, { cursor, limit });
  }

  @Get('me/likes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vídeos curtidos pelo usuário' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserLikedVideos(
    @CurrentUser('sub') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.likeService.getUserLikedVideos(userId, { cursor, limit });
  }

  // ==================== COMMENTS ====================

  @Post('videos/:id/comment')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Comentar em vídeo' })
  @ApiResponse({ status: 201, type: CommentResponseDto })
  async createComment(
    @Param('id') videoId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser('sub') userId: string,
  ): Promise<CommentResponseDto> {
    return this.commentService.createComment(userId, videoId, dto.content, dto.parentId);
  }

  @Get('videos/:id/comments')
  @ApiOperation({ summary: 'Listar comentários do vídeo' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sort', required: false, enum: ['newest', 'top'] })
  async getVideoComments(
    @Param('id') videoId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
    @Query('sort') sort: 'newest' | 'top' = 'newest',
  ): Promise<CommentsListResponseDto> {
    return this.commentService.getVideoComments(videoId, { cursor, limit, sort });
  }

  @Get('comments/:id/replies')
  @ApiOperation({ summary: 'Listar respostas de um comentário' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getCommentReplies(
    @Param('id') commentId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 10,
  ) {
    return this.commentService.getCommentReplies(commentId, { cursor, limit });
  }

  @Delete('comments/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletar comentário' })
  async deleteComment(
    @Param('id') commentId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<void> {
    await this.commentService.deleteComment(userId, commentId);
  }

  // ==================== FOLLOWS ====================

  @Post('profiles/:id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Seguir perfil' })
  @ApiResponse({ status: 200, type: FollowResponseDto })
  async followProfile(
    @Param('id') profileId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<FollowResponseDto> {
    return this.followService.followProfile(userId, profileId);
  }

  @Delete('profiles/:id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deixar de seguir perfil' })
  @ApiResponse({ status: 200, type: FollowResponseDto })
  async unfollowProfile(
    @Param('id') profileId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<FollowResponseDto> {
    return this.followService.unfollowProfile(userId, profileId);
  }

  @Get('profiles/:id/followers')
  @ApiOperation({ summary: 'Listar seguidores do perfil' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFollowers(
    @Param('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.followService.getFollowers(userId, { cursor, limit });
  }

  @Get('profiles/:id/following')
  @ApiOperation({ summary: 'Listar quem o perfil segue' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFollowing(
    @Param('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.followService.getFollowing(userId, { cursor, limit });
  }

  @Get('profiles/:id/follow-stats')
  @ApiOperation({ summary: 'Estatísticas de follows do perfil' })
  async getFollowStats(@Param('id') userId: string) {
    return this.followService.getFollowStats(userId);
  }

  @Get('me/following/feed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Feed de quem você segue' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFollowingFeed(
    @CurrentUser('sub') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.followService.getFollowingFeed(userId, { cursor, limit });
  }

  // ==================== SHARES ====================

  @Post('videos/:id/share')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Compartilhar vídeo' })
  @ApiResponse({ status: 200, type: ShareResponseDto })
  async shareVideo(
    @Param('id') videoId: string,
    @Body() dto: ShareVideoDto,
    @CurrentUser('sub') userId: string,
  ): Promise<ShareResponseDto> {
    return this.shareService.shareVideo(userId, videoId, dto.platform);
  }

  @Get('videos/:id/shares/stats')
  @ApiOperation({ summary: 'Estatísticas de compartilhamento do vídeo' })
  async getVideoShareStats(@Param('id') videoId: string) {
    return this.shareService.getVideoShareStats(videoId);
  }

  @Get('shares/trending')
  @ApiOperation({ summary: 'Vídeos mais compartilhados' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'timeframe', required: false, enum: ['day', 'week', 'month'] })
  async getMostSharedVideos(
    @Query('limit') limit: number = 10,
    @Query('timeframe') timeframe: 'day' | 'week' | 'month' = 'week',
  ) {
    return this.shareService.getMostSharedVideos({ limit, timeframe });
  }

  // ==================== VIEWS ====================

  @Post('videos/:id/view')
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({ summary: 'Registrar visualização de vídeo' })
  @ApiResponse({ status: 200, type: ViewResponseDto })
  async trackView(
    @Param('id') videoId: string,
    @Body() dto: TrackViewDto,
    @CurrentUser('sub') userId: string | undefined,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
    @Headers('referer') referrer: string,
  ): Promise<ViewResponseDto> {
    const result = await this.viewService.trackView(
      videoId,
      {
        watchTime: dto.watchTime,
        percentWatched: dto.percentWatched || 0,
        completed: dto.completed || false,
        skipped: dto.skipped || false,
        skipAt: dto.skipAt,
        videoDuration: dto.videoDuration,
      },
      {
        userId,
        ipAddress,
        userAgent,
        referrer,
      },
    );

    return {
      tracked: result.tracked,
      viewsCount: result.viewsCount,
    };
  }

  @Get('videos/:id/views')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar views do vídeo (apenas dono)' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getVideoViews(
    @Param('id') videoId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.viewService.getVideoViews(videoId, { cursor, limit });
  }

  @Get('videos/:id/metrics')
  @ApiOperation({ summary: 'Métricas de visualização do vídeo' })
  @ApiResponse({ status: 200, type: ViewMetricsDto })
  async getVideoMetrics(@Param('id') videoId: string) {
    return this.viewService.getVideoMetrics(videoId);
  }

  @Get('me/views/history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Histórico de visualizações do usuário' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserViewHistory(
    @CurrentUser('sub') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.viewService.getUserViewHistory(userId, { cursor, limit });
  }
}
