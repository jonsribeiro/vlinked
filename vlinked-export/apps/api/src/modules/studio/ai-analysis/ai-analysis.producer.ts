import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export interface AIAnalysisJobData {
  videoId: string;
  storageKey: string;
  userId: string;
  hlsUrl: string;
}

/**
 * Producer para fila de análise de IA
 * 
 * Responsabilidades:
 * - Receber evento video.processed
 * - Adicionar job na fila 'ai-analysis'
 * - Monitorar status dos jobs
 */
@Injectable()
export class AIAnalysisProducer implements OnModuleInit {
  private readonly logger = new Logger(AIAnalysisProducer.name);

  constructor(
    @InjectQueue('ai-analysis') private readonly aiQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    // Limpar jobs antigos
    await this.cleanOldJobs();
  }

  /**
   * Handler para evento de vídeo processado
   * Adiciona job na fila de análise de IA
   */
  @OnEvent('video.processed', { async: true })
  async handleVideoProcessed(payload: {
    videoId: string;
    userId: string;
    storageKey: string;
    hlsUrl: string;
  }): Promise<void> {
    this.logger.log(`Enfileirando análise de IA: ${payload.videoId}`);

    try {
      // Verificar se já existe job para este vídeo
      const existingJobs = await this.aiQueue.getJobs(['waiting', 'active', 'delayed']);
      const alreadyQueued = existingJobs.some(
        job => job.data.videoId === payload.videoId
      );

      if (alreadyQueued) {
        this.logger.warn(`Job de IA já existe para vídeo: ${payload.videoId}`);
        return;
      }

      // Adicionar job na fila
      const job = await this.aiQueue.add(
        'analyze-video',
        {
          videoId: payload.videoId,
          storageKey: payload.storageKey,
          userId: payload.userId,
          hlsUrl: payload.hlsUrl,
        },
        {
          jobId: `ai-${payload.videoId}`, // ID único para evitar duplicatas
          priority: 2, // Menor prioridade que processamento
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 10000, // 10s inicial (API rate limits)
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

      this.logger.log(`Job de IA adicionado: ${job.id} para vídeo ${payload.videoId}`);
    } catch (error) {
      this.logger.error(`Erro ao enfileirar análise: ${payload.videoId}`, error);
      
      // Análise de IA é opcional - não falhar o vídeo
      // Apenas logar e continuar
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
    const jobId = `ai-${videoId}`;
    const job = await this.aiQueue.getJob(jobId);

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
   * Reprocessar análise (retry manual)
   */
  async retryAnalysis(
    videoId: string,
    storageKey: string,
    userId: string,
    hlsUrl: string,
  ): Promise<void> {
    const jobId = `ai-${videoId}`;
    
    // Remover job anterior se existir
    const existingJob = await this.aiQueue.getJob(jobId);
    if (existingJob) {
      await existingJob.remove();
    }

    // Adicionar novo job
    await this.aiQueue.add(
      'analyze-video',
      { videoId, storageKey, userId, hlsUrl },
      { jobId },
    );

    this.logger.log(`Retry de análise solicitado: ${videoId}`);
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
      this.aiQueue.getWaitingCount(),
      this.aiQueue.getActiveCount(),
      this.aiQueue.getCompletedCount(),
      this.aiQueue.getFailedCount(),
      this.aiQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  private async cleanOldJobs(): Promise<void> {
    try {
      // Remover jobs completados com mais de 24h
      await this.aiQueue.clean(86400000, 100, 'completed');
      
      // Remover jobs falhos com mais de 7 dias
      await this.aiQueue.clean(604800000, 100, 'failed');

      this.logger.log('Limpeza de jobs de IA antigos concluída');
    } catch (error) {
      this.logger.error('Erro ao limpar jobs de IA antigos', error);
    }
  }
}
