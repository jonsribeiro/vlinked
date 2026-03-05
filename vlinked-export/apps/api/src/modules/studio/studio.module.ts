import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StudioController } from './studio.controller';
import { UploadController } from './upload/upload.controller';
import { UploadService } from './upload/upload.service';
import { VirusScanService } from './upload/virus-scan.service';
import { VideoProcessingService } from './processing/video-processing.service';
import { AIAnalysisService } from './ai-analysis/ai-analysis.service';
import { VideoProcessingWorker } from './workers/video-processing.worker';
import { AIAnalysisWorker } from './workers/ai-analysis.worker';
import { StudioQueueService } from './queue/studio-queue.service';
import { StudioOrchestratorService } from './orchestrator/studio-orchestrator.service';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    StorageModule,
    
    // Filas BullMQ
    BullModule.registerQueue(
      {
        name: 'video-processing',
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: {
            age: 24 * 3600,
            count: 100,
          },
          removeOnFail: {
            age: 7 * 24 * 3600,
          },
        },
      },
      {
        name: 'ai-analysis',
        defaultJobOptions: {
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
      },
    ),
  ],
  controllers: [StudioController, UploadController],
  providers: [
    // Serviços
    UploadService,
    VirusScanService,
    VideoProcessingService,
    AIAnalysisService,
    StudioQueueService,
    StudioOrchestratorService,
    
    // Workers
    VideoProcessingWorker,
    AIAnalysisWorker,
  ],
  exports: [UploadService, StudioQueueService],
})
export class StudioModule {}
