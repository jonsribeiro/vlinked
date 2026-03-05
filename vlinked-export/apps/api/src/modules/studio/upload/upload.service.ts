import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHash } from 'crypto';

export interface UploadSession {
  sessionId: string;
  userId: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum: string;
  status: UploadStatus;
  s3Key: string;
  presignedUrl: string;
  expiresAt: Date;
  metadata?: {
    title?: string;
    description?: string;
    type?: string;
  };
}

export enum UploadStatus {
  PENDING = 'PENDING',
  UPLOADING = 'UPLOADING',
  UPLOADED = 'UPLOADED',
  SCANNING = 'SCANNING',
  CLEAN = 'CLEAN',
  INFECTED = 'INFECTED',
  FAILED = 'FAILED',
}

export interface PresignedUrlResponse {
  sessionId: string;
  presignedUrl: string;
  expiresIn: number;
  maxFileSize: number;
  allowedTypes: string[];
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  // Limites de upload
  private readonly MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
  private readonly ALLOWED_TYPES = [
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'video/mov',
  ];

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Gera URL pré-assinada para upload direto ao storage (R2/S3)
   * Fluxo: Client -> API (presigned URL) -> Storage (upload direto)
   */
  async generatePresignedUrl(
    userId: string,
    fileInfo: {
      filename: string;
      mimeType: string;
      size: number;
      checksum: string;
    },
    metadata?: { title?: string; description?: string; type?: string },
  ): Promise<PresignedUrlResponse> {
    // Validar tipo de arquivo
    if (!this.ALLOWED_TYPES.includes(fileInfo.mimeType)) {
      throw new BadRequestException(
        `Tipo de arquivo não suportado. Permitidos: ${this.ALLOWED_TYPES.join(', ')}`,
      );
    }

    // Validar tamanho
    if (fileInfo.size > this.MAX_FILE_SIZE) {
      throw new BadRequestException(
        `Arquivo muito grande. Máximo: ${this.MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    // Gerar session ID único
    const sessionId = this.generateSessionId(userId, fileInfo.filename);
    
    // Storage key organizada por usuário e data
    const storageKey = this.generateStorageKey(userId, fileInfo.filename);

    // Gerar presigned URL (válida por 15 minutos)
    const presignedUrl = await this.storage.generatePresignedUrl(
      storageKey,
      fileInfo.mimeType,
      900,
      {
        'x-amz-meta-session-id': sessionId,
        'x-amz-meta-user-id': userId,
        'x-amz-meta-checksum': fileInfo.checksum,
      },
    );

    // Salvar sessão no Redis (30 minutos)
    const session: UploadSession = {
      sessionId,
      userId,
      filename: fileInfo.filename,
      mimeType: fileInfo.mimeType,
      size: fileInfo.size,
      checksum: fileInfo.checksum,
      status: UploadStatus.PENDING,
      s3Key: storageKey,
      presignedUrl,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      metadata,
    };

    await this.redis.setex(
      `upload:session:${sessionId}`,
      1800, // 30 minutos
      JSON.stringify(session),
    );

    this.logger.log(`Presigned URL gerada: ${sessionId} para usuário ${userId}`);

    return {
      sessionId,
      presignedUrl,
      expiresIn: 900,
      maxFileSize: this.MAX_FILE_SIZE,
      allowedTypes: this.ALLOWED_TYPES,
    };
  }

  /**
   * Confirma upload completo (chamado pelo cliente após upload ao storage)
   * Inicia scan de vírus e processamento
   */
  async confirmUpload(sessionId: string, userId: string): Promise<void> {
    const session = await this.getUploadSession(sessionId);
    
    if (!session) {
      throw new BadRequestException('Sessão de upload não encontrada');
    }

    if (session.userId !== userId) {
      throw new BadRequestException('Sessão não pertence ao usuário');
    }

    // Verificar se arquivo existe no storage
    const exists = await this.storage.exists(session.s3Key);
    if (!exists) {
      throw new BadRequestException('Arquivo não encontrado no storage');
    }

    // Atualizar status
    session.status = UploadStatus.UPLOADED;
    await this.saveSession(session);

    // Criar registro do vídeo no banco
    const video = await this.prisma.video.create({
      data: {
        userId: session.userId,
        title: session.metadata?.title || session.filename,
        description: session.metadata?.description,
        type: session.metadata?.type || 'WORK_SAMPLE',
        rawUrl: this.storage.getPublicUrl(session.s3Key),
        status: 'PROCESSING',
        fileSize: BigInt(session.size),
      },
    });

    // Emitir evento para iniciar scan de vírus
    this.eventEmitter.emit('video.uploaded', {
      videoId: video.id,
      sessionId,
      storageKey: session.s3Key,
      userId,
    });

    // Atualizar sessão com videoId
    await this.redis.setex(
      `upload:video:${video.id}`,
      3600,
      JSON.stringify({ sessionId, storageKey: session.s3Key }),
    );

    this.logger.log(`Upload confirmado: ${sessionId}, vídeo: ${video.id}`);
  }

  /**
   * Atualiza status do scan de vírus
   */
  async updateScanStatus(
    sessionId: string,
    status: UploadStatus.CLEAN | UploadStatus.INFECTED,
    scanResult?: {
      engine?: string;
      threats?: string[];
      scannedAt?: Date;
    },
  ): Promise<void> {
    const session = await this.getUploadSession(sessionId);
    
    if (!session) {
      this.logger.warn(`Sessão não encontrada: ${sessionId}`);
      return;
    }

    session.status = status;
    await this.saveSession(session);

    // Buscar vídeo associado
    const video = await this.prisma.video.findFirst({
      where: { rawUrl: { contains: session.s3Key } },
    });

    if (!video) {
      this.logger.warn(`Vídeo não encontrado para sessão: ${sessionId}`);
      return;
    }

    if (status === UploadStatus.INFECTED) {
      // Deletar arquivo infectado do storage
      await this.storage.delete(session.s3Key);

      // Atualizar vídeo como falho
      await this.prisma.video.update({
        where: { id: video.id },
        data: {
          status: 'FAILED',
          aiSummary: `Arquivo infectado detectado: ${scanResult?.threats?.join(', ')}`,
        },
      });

      this.logger.error(`Arquivo infectado deletado: ${session.s3Key}`);
      return;
    }

    // Arquivo limpo - emitir evento para processamento (vai para fila)
    await this.prisma.video.update({
      where: { id: video.id },
      data: { status: 'PROCESSING' },
    });

    // Emitir evento para processamento de vídeo (será capturado e colocado na fila)
    this.eventEmitter.emit('video.clean', {
      videoId: video.id,
      storageKey: session.s3Key,
      userId: session.userId,
    });

    this.logger.log(`Arquivo limpo, enfileirando processamento: ${video.id}`);
  }

  /**
   * Retorna status do upload
   */
  async getStatus(sessionId: string, userId: string): Promise<UploadSession | null> {
    const session = await this.getUploadSession(sessionId);
    
    if (!session || session.userId !== userId) {
      return null;
    }

    return session;
  }

  /**
   * Cancela upload em andamento
   */
  async cancelUpload(sessionId: string, userId: string): Promise<void> {
    const session = await this.getUploadSession(sessionId);
    
    if (!session || session.userId !== userId) {
      throw new BadRequestException('Sessão não encontrada');
    }

    // Deletar do storage se já foi feito upload
    if (session.status === UploadStatus.UPLOADED) {
      await this.storage.delete(session.s3Key);
    }

    // Remover sessão
    await this.redis.del(`upload:session:${sessionId}`);

    this.logger.log(`Upload cancelado: ${sessionId}`);
  }

  // ==================== Private Methods ====================

  private async getUploadSession(sessionId: string): Promise<UploadSession | null> {
    const data = await this.redis.get(`upload:session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  private async saveSession(session: UploadSession): Promise<void> {
    const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    await this.redis.setex(
      `upload:session:${session.sessionId}`,
      Math.max(ttl, 60),
      JSON.stringify(session),
    );
  }

  private generateSessionId(userId: string, filename: string): string {
    const hash = createHash('sha256')
      .update(`${userId}:${filename}:${Date.now()}:${Math.random()}`)
      .digest('hex')
      .slice(0, 16);
    return `ups_${hash}`;
  }

  private generateStorageKey(userId: string, filename: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 10);
    const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    return `uploads/${userId}/${year}/${month}/${day}/${random}_${sanitized}`;
  }
}
