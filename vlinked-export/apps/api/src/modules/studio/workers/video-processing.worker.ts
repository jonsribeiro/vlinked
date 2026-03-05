import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface VideoProcessingJob {
  videoId: string;
  s3Key: string;
  userId: string;
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  codec: string;
}

/**
 * Worker de processamento de vídeo
 * 
 * Fila: video-processing
 * Responsabilidades:
 * - Transcodificar vídeos para múltiplas resoluções
 * - Gerar HLS com playlists adaptativas
 * - Extrair thumbnails
 * - Extrair metadados
 * 
 * Tecnologia: FFmpeg
 */
@Processor('video-processing', {
  concurrency: 2, // Processar 2 vídeos simultaneamente
  limiter: {
    max: 10, // Máximo 10 jobs por minuto
    duration: 60000,
  },
})
export class VideoProcessingWorker extends WorkerHost {
  private readonly logger = new Logger(VideoProcessingWorker.name);

  // Configurações de processamento
  private readonly RESOLUTIONS = [
    { name: '1080p', width: 1920, height: 1080, bitrate: '5000k', maxrate: '5350k', bufsize: '7500k' },
    { name: '720p', width: 1280, height: 720, bitrate: '2500k', maxrate: '2675k', bufsize: '3750k' },
    { name: '480p', width: 854, height: 480, bitrate: '1000k', maxrate: '1070k', bufsize: '1500k' },
    { name: '360p', width: 640, height: 360, bitrate: '500k', maxrate: '535k', bufsize: '750k' },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<VideoProcessingJob>): Promise<any> {
    const { videoId, s3Key, userId } = job.data;
    
    this.logger.log(`[${job.id}] Iniciando processamento: ${videoId}`);
    await job.updateProgress(5);

    const workDir = await this.createWorkDir(videoId);
    const inputPath = join(workDir, 'input.mp4');

    try {
      // 1. Download do arquivo original
      this.logger.debug(`[${job.id}] Download: ${s3Key}`);
      await this.storage.downloadToFile(s3Key, inputPath);
      await job.updateProgress(15);

      // 2. Extrair informações do vídeo
      this.logger.debug(`[${job.id}] Extraindo informações`);
      const videoInfo = await this.getVideoInfo(inputPath);
      await job.updateProgress(25);

      // 3. Gerar thumbnail
      this.logger.debug(`[${job.id}] Gerando thumbnail`);
      const thumbnailPath = join(workDir, 'thumbnail.jpg');
      await this.generateThumbnail(inputPath, thumbnailPath, videoInfo.duration);
      await job.updateProgress(35);

      // 4. Determinar resoluções a processar
      const targetResolutions = this.getTargetResolutions(videoInfo);

      // 5. Gerar HLS com múltiplas variantes
      this.logger.debug(`[${job.id}] Gerando HLS com ${targetResolutions.length} variantes`);
      const hlsDir = join(workDir, 'hls');
      await fs.mkdir(hlsDir, { recursive: true });
      await this.generateHLS(inputPath, hlsDir, targetResolutions, job);
      await job.updateProgress(75);

      // 6. Upload dos arquivos processados
      this.logger.debug(`[${job.id}] Upload para storage`);
      const outputKey = `processed/${videoId}`;
      
      // Upload thumbnail
      const thumbnailKey = `${outputKey}/thumbnail.jpg`;
      const thumbnailBuffer = await fs.readFile(thumbnailPath);
      await this.storage.uploadBuffer(thumbnailKey, thumbnailBuffer, 'image/jpeg');

      // Upload HLS files
      const hlsFiles = await fs.readdir(hlsDir);
      for (const file of hlsFiles) {
        const filePath = join(hlsDir, file);
        const fileKey = `${outputKey}/hls/${file}`;
        const contentType = file.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T';
        const buffer = await fs.readFile(filePath);
        await this.storage.uploadBuffer(fileKey, buffer, contentType, {
          'cache-control': file.endsWith('.m3u8') ? 'max-age=5' : 'max-age=31536000',
        });
      }
      await job.updateProgress(90);

      // 7. Atualizar vídeo no banco
      const hlsUrl = `${this.storage.getPublicUrl(outputKey)}/hls/master.m3u8`;
      const thumbnailUrl = this.storage.getPublicUrl(thumbnailKey);

      await this.prisma.video.update({
        where: { id: videoId },
        data: {
          status: 'READY',
          processedUrl: hlsUrl,
          thumbnailUrl: thumbnailUrl,
          duration: Math.round(videoInfo.duration),
          resolution: `${videoInfo.width}x${videoInfo.height}`,
        },
      });

      // 8. Emitir evento para próxima etapa (AI analysis)
      this.eventEmitter.emit('video.processed', {
        videoId,
        userId,
        s3Key,
        hlsUrl,
      });

      await job.updateProgress(100);

      this.logger.log(`[${job.id}] Processamento concluído: ${videoId}`);

      return {
        success: true,
        videoId,
        outputs: {
          hlsUrl,
          thumbnailUrl,
          duration: Math.round(videoInfo.duration),
          resolution: `${videoInfo.width}x${videoInfo.height}`,
        },
      };
    } catch (error) {
      this.logger.error(`[${job.id}] Erro no processamento: ${videoId}`, error);

      // Atualizar vídeo como falho
      await this.prisma.video.update({
        where: { id: videoId },
        data: {
          status: 'FAILED',
          aiSummary: `Erro no processamento: ${error.message}`,
        },
      });

      throw error;
    } finally {
      // Cleanup
      await this.cleanup(workDir);
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`[${job.id}] Job completado: ${job.data.videoId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`[${job.id}] Job falhou: ${job.data.videoId}`, error);
  }

  // ==================== FFmpeg Operations ====================

  private async getVideoInfo(inputPath: string): Promise<VideoInfo> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,r_frame_rate,bit_rate,codec_name',
        '-show_entries', 'format=duration',
        '-of', 'json',
        inputPath,
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed with code ${code}`));
          return;
        }

        try {
          const info = JSON.parse(output);
          const stream = info.streams?.[0] || {};
          const format = info.format || {};

          const fpsStr = stream.r_frame_rate || '30/1';
          const [num, den] = fpsStr.split('/').map(Number);
          const fps = num / den;

          resolve({
            duration: parseFloat(format.duration) || 0,
            width: stream.width || 1920,
            height: stream.height || 1080,
            fps: Math.round(fps),
            bitrate: parseInt(stream.bit_rate) || 5000000,
            codec: stream.codec_name || 'h264',
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private async generateThumbnail(
    inputPath: string,
    outputPath: string,
    duration: number,
  ): Promise<void> {
    const time = Math.min(duration * 0.1, 5);

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-ss', time.toString(),
        '-vframes', '1',
        '-q:v', '2',
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
        '-f', 'image2',
        outputPath,
      ]);

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Thumbnail generation failed with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  }

  private async generateHLS(
    inputPath: string,
    outputDir: string,
    resolutions: typeof this.RESOLUTIONS,
    job: Job,
  ): Promise<void> {
    // Construir filter_complex dinamicamente baseado nas resoluções
    const filterInputs = resolutions.map((_, i) => `[0:v]copy[v${i}]`).join(';');
    const filterScales = resolutions.map((r, i) => 
      `[v${i}]scale=w=${r.width}:h=${r.height}:force_original_aspect_ratio=decrease,pad=${r.width}:${r.height}:(ow-iw)/2:(oh-ih)/2[v${i}out]`
    ).join(';');
    
    const filterComplex = `${filterInputs};${filterScales}`;

    const args = [
      '-i', inputPath,
      '-filter_complex', filterComplex,
      ...resolutions.flatMap((res, i) => [
        `-map`, `[v${i}out]`,
        `-map`, `0:a?`,
        `-c:v:${i}`, 'libx264',
        `-b:v:${i}`, res.bitrate,
        `-maxrate:v:${i}`, res.maxrate,
        `-bufsize:v:${i}`, res.bufsize,
        `-c:a:${i}`, 'aac',
        `-b:a:${i}`, '128k',
      ]),
      '-var_stream_map', resolutions.map((_, i) => `v:${i},a:${i}`).join(' '),
      '-preset', 'fast',
      '-hls_time', '6',
      '-hls_list_size', '0',
      '-hls_segment_filename', `${outputDir}/segment_%v_%03d.ts`,
      '-master_pl_name', 'master.m3u8',
      '-f', 'hls',
      `${outputDir}/variant_%v.m3u8`,
    ];

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);

      let errorOutput = '';
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
        // Parse progress se possível
        const progressMatch = data.toString().match(/time=(\d+:\d+:\d+\.\d+)/);
        if (progressMatch) {
          // Atualizar progresso incremental
        }
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          this.logger.error(`HLS generation error: ${errorOutput}`);
          reject(new Error(`HLS generation failed with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  }

  // ==================== Utility Methods ====================

  private async createWorkDir(videoId: string): Promise<string> {
    const workDir = join(tmpdir(), `vlinked-${videoId}`);
    await fs.mkdir(workDir, { recursive: true });
    return workDir;
  }

  private async cleanup(workDir: string): Promise<void> {
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(`Failed to cleanup: ${workDir}`, error);
    }
  }

  private getTargetResolutions(videoInfo: VideoInfo): typeof this.RESOLUTIONS {
    return this.RESOLUTIONS.filter((res) => res.height <= videoInfo.height);
  }
}
