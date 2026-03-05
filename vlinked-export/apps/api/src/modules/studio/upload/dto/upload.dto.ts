import { IsString, IsNumber, IsOptional, IsEnum, IsIn, MaxLength, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GeneratePresignedUrlDto {
  @ApiProperty({ description: 'Nome do arquivo' })
  @IsString()
  @MaxLength(255)
  filename: string;

  @ApiProperty({ description: 'MIME type do arquivo' })
  @IsString()
  @IsIn([
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'video/mov',
  ])
  mimeType: string;

  @ApiProperty({ description: 'Tamanho em bytes' })
  @IsNumber()
  @Min(1)
  @Max(2 * 1024 * 1024 * 1024) // 2GB
  size: number;

  @ApiProperty({ description: 'Checksum SHA256 do arquivo' })
  @IsString()
  checksum: string;

  @ApiPropertyOptional({ description: 'Título do vídeo' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ description: 'Descrição do vídeo' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Tipo do vídeo', enum: ['VIDEO_CV', 'WORK_SAMPLE', 'PORTFOLIO', 'TIP', 'BEHIND_SCENES'] })
  @IsOptional()
  @IsString()
  type?: string;
}

export class ConfirmUploadDto {
  @ApiProperty({ description: 'ID da sessão de upload' })
  @IsString()
  sessionId: string;
}

export class UploadStatusResponseDto {
  @ApiProperty()
  sessionId: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  filename: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  size: number;

  @ApiPropertyOptional()
  expiresAt?: Date;

  @ApiPropertyOptional()
  videoId?: string;
}

export class PresignedUrlResponseDto {
  @ApiProperty()
  sessionId: string;

  @ApiProperty()
  presignedUrl: string;

  @ApiProperty()
  expiresIn: number;

  @ApiProperty()
  maxFileSize: number;

  @ApiProperty({ type: [String] })
  allowedTypes: string[];
}
