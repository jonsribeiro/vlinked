import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequireQuota } from '../../quota/decorators/require-quota.decorator';
import {
  GeneratePresignedUrlDto,
  ConfirmUploadDto,
  UploadStatusResponseDto,
  PresignedUrlResponseDto,
} from './dto/upload.dto';

@ApiTags('Studio - Upload')
@ApiBearerAuth()
@Controller('studio/upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('presigned-url')
  @RequireQuota('uploads')
  @ApiOperation({ summary: 'Gerar URL pré-assinada para upload direto ao S3' })
  @ApiResponse({
    status: 201,
    description: 'URL pré-assinada gerada',
    type: PresignedUrlResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 403, description: 'Quota excedida' })
  async generatePresignedUrl(
    @Body() dto: GeneratePresignedUrlDto,
    @CurrentUser('sub') userId: string,
  ): Promise<PresignedUrlResponseDto> {
    return this.uploadService.generatePresignedUrl(userId, {
      filename: dto.filename,
      mimeType: dto.mimeType,
      size: dto.size,
      checksum: dto.checksum,
    }, {
      title: dto.title,
      description: dto.description,
      type: dto.type,
    });
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar upload completo (após upload S3)' })
  @ApiResponse({ status: 200, description: 'Upload confirmado' })
  @ApiResponse({ status: 400, description: 'Sessão inválida' })
  async confirmUpload(
    @Body() dto: ConfirmUploadDto,
    @CurrentUser('sub') userId: string,
  ): Promise<{ message: string }> {
    await this.uploadService.confirmUpload(dto.sessionId, userId);
    return { message: 'Upload confirmado. Processamento iniciado.' };
  }

  @Get('status/:sessionId')
  @ApiOperation({ summary: 'Obter status do upload' })
  @ApiResponse({
    status: 200,
    description: 'Status do upload',
    type: UploadStatusResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Sessão não encontrada' })
  async getStatus(
    @Param('sessionId') sessionId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<UploadStatusResponseDto | { message: string }> {
    const session = await this.uploadService.getStatus(sessionId, userId);
    
    if (!session) {
      return { message: 'Sessão não encontrada' };
    }

    return {
      sessionId: session.sessionId,
      status: session.status,
      filename: session.filename,
      mimeType: session.mimeType,
      size: session.size,
      expiresAt: session.expiresAt,
    };
  }

  @Delete(':sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancelar upload' })
  @ApiResponse({ status: 204, description: 'Upload cancelado' })
  async cancelUpload(
    @Param('sessionId') sessionId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<void> {
    await this.uploadService.cancelUpload(sessionId, userId);
  }
}
