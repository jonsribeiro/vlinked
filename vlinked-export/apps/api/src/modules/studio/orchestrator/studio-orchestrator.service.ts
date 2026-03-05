import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { StudioQueueService } from '../queue/studio-queue.service';

/**
 * Orquestrador do Studio
 * 
 * Responsável por gerenciar o fluxo de processamento:
 * upload → video.uploaded → virus scan → video.clean 
 * → queue: video-processing → video.processed 
 * → queue: ai-analysis → video.analyzed 
 * → feed-indexer
 */
@Injectable()
export class StudioOrchestratorService {
  private readonly logger = new Logger(StudioOrchestratorService.name);

  constructor(private readonly queueService: StudioQueueService) {}

  /**
   * Handler: Vídeo limpo após scan de vírus
   * Adiciona à fila de processamento de vídeo
   */
  @OnEvent('video.clean', { async: true })
  async handleVideoClean(payload: {
    videoId: string;
    storageKey: string;
    userId: string;
  }): Promise<void> {
    this.logger.log(`Enfileirando processamento: ${payload.videoId}`);

    await this.queueService.addVideoProcessingJob({
      videoId: payload.videoId,
      s3Key: payload.storageKey,
      userId: payload.userId,
    });

    this.logger.log(`Job de processamento adicionado: ${payload.videoId}`);
  }

  /**
   * Handler: Vídeo processado (FFmpeg completo)
   * Adiciona à fila de análise de IA
   */
  @OnEvent('video.processed', { async: true })
  async handleVideoProcessed(payload: {
    videoId: string;
    userId: string;
    s3Key: string;
    hlsUrl: string;
  }): Promise<void> {
    this.logger.log(`Enfileirando análise de IA: ${payload.videoId}`);

    await this.queueService.addAIAnalysisJob({
      videoId: payload.videoId,
      userId: payload.userId,
      s3Key: payload.s3Key,
      hlsUrl: payload.hlsUrl,
    });

    this.logger.log(`Job de análise adicionado: ${payload.videoId}`);
  }
}
