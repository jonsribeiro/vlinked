import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Studio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('studio')
export class StudioController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('videos')
  @ApiOperation({ summary: 'Listar vídeos do usuário' })
  @ApiQuery({ name: 'status', required: false, enum: ['UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'HIDDEN'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista de vídeos' })
  async listVideos(
    @CurrentUser('sub') userId: string,
    @Query('status') status?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    const where: any = { userId };
    
    if (status) {
      where.status = status;
    }

    const [videos, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          thumbnailUrl: true,
          duration: true,
          status: true,
          visibility: true,
          viewsCount: true,
          likesCount: true,
          commentsCount: true,
          createdAt: true,
          publishedAt: true,
        },
      }),
      this.prisma.video.count({ where }),
    ]);

    return {
      data: videos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @Get('videos/:id')
  @ApiOperation({ summary: 'Obter detalhes do vídeo' })
  @ApiResponse({ status: 200, description: 'Detalhes do vídeo' })
  @ApiResponse({ status: 404, description: 'Vídeo não encontrado' })
  async getVideo(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    const video = await this.prisma.video.findFirst({
      where: { id, userId },
      include: {
        feedItems: {
          select: {
            score: true,
            impressions: true,
            clicks: true,
          },
        },
      },
    });

    if (!video) {
      return { message: 'Vídeo não encontrado' };
    }

    return { data: video };
  }

  @Post('videos/:id/publish')
  @ApiOperation({ summary: 'Publicar vídeo' })
  @ApiResponse({ status: 200, description: 'Vídeo publicado' })
  async publishVideo(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    const video = await this.prisma.video.findFirst({
      where: { id, userId, status: 'READY' },
    });

    if (!video) {
      return { message: 'Vídeo não encontrado ou não está pronto' };
    }

    const updated = await this.prisma.video.update({
      where: { id },
      data: {
        visibility: 'PUBLIC',
        publishedAt: new Date(),
      },
    });

    return {
      message: 'Vídeo publicado com sucesso',
      data: updated,
    };
  }

  @Post('videos/:id/hide')
  @ApiOperation({ summary: 'Ocultar vídeo' })
  @ApiResponse({ status: 200, description: 'Vídeo oculto' })
  async hideVideo(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    const video = await this.prisma.video.findFirst({
      where: { id, userId },
    });

    if (!video) {
      return { message: 'Vídeo não encontrado' };
    }

    const updated = await this.prisma.video.update({
      where: { id },
      data: {
        visibility: 'PRIVATE',
        status: 'HIDDEN',
      },
    });

    return {
      message: 'Vídeo oculto com sucesso',
      data: updated,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estatísticas do studio' })
  @ApiResponse({ status: 200, description: 'Estatísticas' })
  async getStats(@CurrentUser('sub') userId: string) {
    const [
      totalVideos,
      publishedVideos,
      processingVideos,
      failedVideos,
      totalViews,
      totalLikes,
    ] = await Promise.all([
      this.prisma.video.count({ where: { userId } }),
      this.prisma.video.count({ where: { userId, visibility: 'PUBLIC' } }),
      this.prisma.video.count({ where: { userId, status: 'PROCESSING' } }),
      this.prisma.video.count({ where: { userId, status: 'FAILED' } }),
      this.prisma.video.aggregate({
        where: { userId },
        _sum: { viewsCount: true },
      }),
      this.prisma.video.aggregate({
        where: { userId },
        _sum: { likesCount: true },
      }),
    ]);

    return {
      data: {
        videos: {
          total: totalVideos,
          published: publishedVideos,
          processing: processingVideos,
          failed: failedVideos,
        },
        engagement: {
          totalViews: totalViews._sum.viewsCount || 0,
          totalLikes: totalLikes._sum.likesCount || 0,
        },
      },
    };
  }
}
