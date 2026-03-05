import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { VideoProcessingJob } from '../workers/video-processing.worker';
import { AIAnalysisJob } from '../workers/ai-analysis.worker';

/**
 * Serviço de filas do Studio
 * 
 * Facilita adicionar jobs às filas de processamento
 */
@Injectable()
export class StudioQueueService {
  constructor(
    @InjectQueue('video-processing')
    private readonly videoProcessingQueue: Queue<VideoProcessingJob>,
    @InjectQueue('ai-analysis')
    private readonly aiAnalysisQueue: Queue<AIAnalysisJob>,
  ) {}

  /**
   * Adiciona job de processamento de vídeo
   */
  async addVideoProcessingJob(job: VideoProcessingJob): Promise<void> {
    await this.videoProcessingQueue.add(
      'process-video',
      job,
      {
        jobId: `video-process-${job.videoId}`,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 24 * 3600, // Remover após 24h
          count: 100,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Manter falhas por 7 dias
        },
      },
    );
  }

  /**
   * Adiciona job de análise de IA
   */
  async addAIAnalysisJob(job: AIAnalysisJob): Promise<void> {
    await this.aiAnalysisQueue.add(
      'analyze-video',
      job,
      {
        jobId: `ai-analysis-${job.videoId}`,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 100,
        },
        removeOnFail: {
          age: 7 * 24 * 3600,
        },
      },
    );
  }

  /**
   * Retorna status das filas
   */
  async getQueueStatus(): Promise<{
    videoProcessing: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
    aiAnalysis: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
  }> {
    const [
      videoWaiting,
      videoActive,
      videoCompleted,
      videoFailed,
      aiWaiting,
      aiActive,
      aiCompleted,
      aiFailed,
    ] = await Promise.all([
      this.videoProcessingQueue.getWaitingCount(),
      this.videoProcessingQueue.getActiveCount(),
      this.videoProcessingQueue.getCompletedCount(),
      this.videoProcessingQueue.getFailedCount(),
      this.aiAnalysisQueue.getWaitingCount(),
      this.aiAnalysisQueue.getActiveCount(),
      this.aiAnalysisQueue.getCompletedCount(),
      this.aiAnalysisQueue.getFailedCount(),
    ]);

    return {
      videoProcessing: {
        waiting: videoWaiting,
        active: videoActive,
        completed: videoCompleted,
        failed: videoFailed,
      },
      aiAnalysis: {
        waiting: aiWaiting,
        active: aiActive,
        completed: aiCompleted,
        failed: aiFailed,
      },
    };
  }

  /**
   * Limpa jobs completados/falhos antigos
   */
  async cleanOldJobs(): Promise<void> {
    await Promise.all([
      this.videoProcessingQueue.clean(24 * 3600 * 1000, 100, 'completed'),
      this.videoProcessingQueue.clean(7 * 24 * 3600 * 1000, 100, 'failed'),
      this.aiAnalysisQueue.clean(24 * 3600 * 1000, 100, 'completed'),
      this.aiAnalysisQueue.clean(7 * 24 * 3600 * 1000, 100, 'failed'),
    ]);
  }
}
