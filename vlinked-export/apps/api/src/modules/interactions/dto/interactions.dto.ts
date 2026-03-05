import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ==================== LIKE DTOs ====================

export class LikeResponseDto {
  @ApiProperty()
  liked: boolean;

  @ApiProperty()
  likesCount: number;
}

// ==================== COMMENT DTOs ====================

export class CreateCommentDto {
  @ApiProperty({ description: 'Conteúdo do comentário' })
  @IsString()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ description: 'ID do comentário pai (para respostas)' })
  @IsOptional()
  @IsString()
  parentId?: string;
}

export class CommentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  content: string;

  @ApiProperty()
  author: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  };

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  likesCount: number;

  @ApiPropertyOptional()
  repliesCount?: number;

  @ApiPropertyOptional()
  parentId?: string;
}

export class CommentsListResponseDto {
  @ApiProperty({ type: [CommentResponseDto] })
  data: CommentResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  hasMore: boolean;
}

// ==================== FOLLOW DTOs ====================

export class FollowResponseDto {
  @ApiProperty()
  following: boolean;

  @ApiProperty()
  followersCount: number;
}

// ==================== SHARE DTOs ====================

export enum SharePlatform {
  COPY_LINK = 'COPY_LINK',
  WHATSAPP = 'WHATSAPP',
  TELEGRAM = 'TELEGRAM',
  TWITTER = 'TWITTER',
  FACEBOOK = 'FACEBOOK',
  LINKEDIN = 'LINKEDIN',
  EMAIL = 'EMAIL',
  EMBED = 'EMBED',
}

export class ShareVideoDto {
  @ApiProperty({ enum: SharePlatform, description: 'Plataforma de compartilhamento' })
  @IsEnum(SharePlatform)
  platform: SharePlatform;
}

export class ShareResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiPropertyOptional()
  shortUrl?: string;

  @ApiPropertyOptional()
  embedCode?: string;
}

// ==================== VIEW DTOs ====================

export class TrackViewDto {
  @ApiProperty({ description: 'Tempo assistido em segundos' })
  @IsNumber()
  @Min(0)
  watchTime: number;

  @ApiPropertyOptional({ description: 'Percentual assistido (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentWatched?: number;

  @ApiPropertyOptional({ description: 'Vídeo foi completado' })
  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @ApiPropertyOptional({ description: 'Vídeo foi pulado' })
  @IsOptional()
  @IsBoolean()
  skipped?: boolean;

  @ApiPropertyOptional({ description: 'Timestamp do pulo (se pulado)' })
  @IsOptional()
  @IsNumber()
  skipAt?: number;

  @ApiPropertyOptional({ description: 'Duração total do vídeo' })
  @IsOptional()
  @IsNumber()
  videoDuration?: number;
}

export class ViewResponseDto {
  @ApiProperty()
  tracked: boolean;

  @ApiProperty()
  viewsCount: number;
}

// ==================== VIEW METRICS DTOs ====================

export class ViewMetricsDto {
  @ApiProperty()
  videoId: string;

  @ApiProperty()
  totalViews: number;

  @ApiProperty()
  uniqueViewers: number;

  @ApiProperty()
  avgWatchTime: number;

  @ApiProperty()
  avgCompletionRate: number;

  @ApiProperty()
  avgSkipRate: number;

  @ApiPropertyOptional()
  watchTimeDistribution?: Record<string, number>;

  @ApiPropertyOptional()
  dropOffPoints?: Record<string, number>;

  @ApiPropertyOptional()
  retentionCurve?: number[];
}
