import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export interface VideoProcessingJobData {
  videoId: string;
  storageKey: string;
  userId: string;
}

/**
 * Producer para fila de processamento de vídeo
 * 
 * Responsabilidades:
 * - Receber evento video.clean
 * - Adicionar job na fila 'video-processing'
 * - Monitorar status dos jobs
 */
@Injectable()
export class VideoProcessingProducer implements OnModuleInit {
  private readonly logger = new Logger(VideoProcessingProducer.name);

  constructor(
    @InjectQueue('video-processing') private readonly videoQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    // Limpar jobs antigos (mais de 24h)
    await this.cleanOldJobs();
  }

  /**
   * Handler para evento de vídeo limpo (após scan)
   * Adiciona job na fila de processamento
   */
  @OnEvent('video.clean', { async: true })
  async handleVideoClean(payload: {
    videoId: string;
    storageKey: string;
    userId: string;
  }): Promise<void> {
    this.logger.log(`Enfileirando processamento: ${payload.videoId}`);

    try {
      // Verificar se já existe job para este vídeo
      const existingJobs = await this.videoQueue.getJobs(['waiting', 'active', 'delayed']);
      const alreadyQueued = existingJobs.some(
        job => job.data.videoId === payload.videoId
      );

      if (alreadyQueued) {
        this.logger.warn(`Job já existe para vídeo: ${payload.videoId}`);
        return;
      }

      // Adicionar job na fila
      const job = await this.videoQueue.add(
        'process-video',
        {
          videoId: payload.videoId,
          storageKey: payload.storageKey,
          userId: payload.userId,
        },
        {
          jobId: `video-${payload.videoId}`, // ID único para evitar duplicatas
          priority: 1,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: {
            age: 86400, // Remover após 24h
            count: 100,
          },
          removeOnFail: {
            age: 604800, // Manter falhas por 7 dias
          },
        },
      );

      this.logger.log(`Job adicionado: ${job.id} para vídeo ${payload.videoId}`);

      // Atualizar status do vídeo
      await this.prisma.video.update({
        where: { id: payload.videoId },
        data: { 
          status: 'PROCESSING',
          aiSummary: 'Aguardando processamento...',
        },
      });
    } catch (error) {
      this.logger.error(`Erro ao enfileirar: ${payload.videoId}`, error);
      
      // Atualizar vídeo como falho
      await this.prisma.video.update({
        where: { id: payload.videoId },
        data: {
          status: 'FAILED',
          aiSummary: `Erro ao enfileirar: ${error.message}`,
        },
      });
    }
  }

  /**
   * Retorna status de um job
   */
  async getJobStatus(videoId: string): Promise<{
    status: string;
    progress: number;
    result?: any;
  } | null> {
    const jobId = `video-${videoId}`;
    const job = await this.videoQueue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();

    return {
      status: state,
      progress: job.progress || 0,
      result: job.returnvalue,
    };
  }

  /**
   * Reprocessar vídeo (retry manual)
   */
  async retryVideo(videoId: string, storageKey: string, userId: string): Promise<void> {
    const jobId = `video-${videoId}`;
    
    // Remover job anterior se existir
    const existingJob = await this.videoQueue.getJob(jobId);
    if (existingJob) {
      await existingJob.remove();
    }

    // Adicionar novo job
    await this.videoQueue.add(
      'process-video',
      { videoId, storageKey, userId },
      { jobId },
    );

    this.logger.log(`Retry solicitado: ${videoId}`);
  }

  /**
   * Estatísticas da fila
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.videoQueue.getWaitingCount(),
      this.videoQueue.getActiveCount(),
      this.videoQueue.getCompletedCount(),
      this.videoQueue.getFailedCount(),
      this.videoQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  private async cleanOldJobs(): Promise<void> {
    try {
      // Remover jobs completados com mais de 24h
      await this.videoQueue.clean(86400000, 100, 'completed');
      
      // Remover jobs falhos com mais de 7 dias
      await this.videoQueue.clean(604800000, 100, 'failed');

      this.logger.log('Limpeza de jobs antigos concluída');
    } catch (error) {
      this.logger.error('Erro ao limpar jobs antigos', error);
    }
  }
}
