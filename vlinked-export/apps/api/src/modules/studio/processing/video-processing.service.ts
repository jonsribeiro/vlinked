import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface ProcessingResult {
  success: boolean;
  videoId: string;
  outputs: {
    hlsUrl?: string;
    thumbnailUrl?: string;
    duration?: number;
    resolution?: string;
  };
  error?: string;
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
 * Serviço de processamento de vídeo
 * 
 * Responsabilidades:
 * - Transcodificar vídeos para múltiplas resoluções
 * - Gerar HLS (HTTP Live Streaming) com playlists adaptativas
 * - Extrair thumbnails
 * - Extrair metadados (duração, resolução, etc)
 * 
 * Tecnologia: FFmpeg
 * 
 * NOTA: Este serviço é chamado pelo VideoProcessingWorker (fila BullMQ)
 * Não deve ser chamado diretamente do servidor principal
 */
@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);

  // Configurações de processamento
  private readonly RESOLUTIONS = [
    { name: '1080p', width: 1920, height: 1080, bitrate: '5000k', maxrate: '5350k', bufsize: '7500k' },
    { name: '720p', width: 1280, height: 720, bitrate: '2500k', maxrate: '2675k', bufsize: '3750k' },
    { name: '480p', width: 854, height: 480, bitrate: '1000k', maxrate: '1070k', bufsize: '1500k' },
    { name: '360p', width: 640, height: 360, bitrate: '500k', maxrate: '535k', bufsize: '750k' },
  ];

  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Processa vídeo completo
   * Fluxo: Download -> Info -> Thumbnail -> Transcode -> HLS -> Upload -> Cleanup
   * 
   * @param videoId ID do vídeo
   * @param storageKey Chave no storage (R2/S3)
   * @param userId ID do usuário
   * @param onProgress Callback para reportar progresso (0-100)
   */
  async processVideo(
    videoId: string,
    storageKey: string,
    userId: string,
    onProgress?: (progress: number) => Promise<void>,
  ): Promise<ProcessingResult> {
    const workDir = await this.createWorkDir(videoId);
    const inputPath = join(workDir, 'input.mp4');

    try {
      // 1. Download do arquivo original
      this.logger.debug(`Download: ${storageKey}`);
      await this.reportProgress(onProgress, 5);
      await this.downloadFromStorage(storageKey, inputPath);

      // 2. Extrair informações do vídeo
      this.logger.debug('Extraindo informações');
      await this.reportProgress(onProgress, 10);
      const videoInfo = await this.getVideoInfo(inputPath);

      // 3. Gerar thumbnail
      this.logger.debug('Gerando thumbnail');
      await this.reportProgress(onProgress, 15);
      const thumbnailPath = join(workDir, 'thumbnail.jpg');
      await this.generateThumbnail(inputPath, thumbnailPath, videoInfo.duration);

      // 4. Determinar resoluções a processar
      const targetResolutions = this.getTargetResolutions(videoInfo);
      this.logger.debug(`Transcodificando para ${targetResolutions.length} resoluções`);

      // 5. Transcodificar para cada resolução
      const variantPaths: { name: string; path: string }[] = [];
      for (let i = 0; i < targetResolutions.length; i++) {
        const res = targetResolutions[i];
        const outputPath = join(workDir, `${res.name}.mp4`);
        await this.transcode(inputPath, outputPath, res);
        variantPaths.push({ name: res.name, path: outputPath });
        
        const progress = 15 + Math.floor((i + 1) / targetResolutions.length * 30);
        await this.reportProgress(onProgress, progress);
      }

      // 6. Gerar playlist HLS
      this.logger.debug('Gerando HLS');
      await this.reportProgress(onProgress, 50);
      const hlsDir = join(workDir, 'hls');
      await fs.mkdir(hlsDir, { recursive: true });
      await this.generateHLS(inputPath, hlsDir, targetResolutions);

      // 7. Upload dos arquivos processados
      this.logger.debug('Upload para storage');
      await this.reportProgress(onProgress, 70);
      const outputKey = `processed/${videoId}`;
      
      // Upload thumbnail
      const thumbnailKey = `${outputKey}/thumbnail.jpg`;
      const thumbnailBuffer = await fs.readFile(thumbnailPath);
      await this.storage.upload({
        key: thumbnailKey,
        body: thumbnailBuffer,
        contentType: 'image/jpeg',
        cacheControl: 'max-age=31536000',
      });

      // Upload HLS files
      await this.reportProgress(onProgress, 80);
      const hlsFiles = await fs.readdir(hlsDir);
      for (let i = 0; i < hlsFiles.length; i++) {
        const file = hlsFiles[i];
        const filePath = join(hlsDir, file);
        const fileKey = `${outputKey}/hls/${file}`;
        const contentType = file.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T';
        const cacheControl = file.endsWith('.m3u8') ? 'max-age=5' : 'max-age=31536000';
        
        const fileBuffer = await fs.readFile(filePath);
        await this.storage.upload({
          key: fileKey,
          body: fileBuffer,
          contentType,
          cacheControl,
        });

        const progress = 80 + Math.floor((i + 1) / hlsFiles.length * 15);
        await this.reportProgress(onProgress, progress);
      }

      // 8. Cleanup
      await this.cleanup(workDir);
      await this.reportProgress(onProgress, 100);

      const hlsUrl = this.storage.getPublicUrl(`${outputKey}/hls/master.m3u8`);
      const thumbnailUrl = this.storage.getPublicUrl(thumbnailKey);

      // Atualizar vídeo no banco
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

      // Emitir evento para análise de IA
      this.eventEmitter.emit('video.processed', {
        videoId,
        userId,
        storageKey,
        hlsUrl,
      });

      this.logger.log(`Processamento concluído: ${videoId}`);

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
      await this.cleanup(workDir);
      
      // Atualizar vídeo como falho
      await this.prisma.video.update({
        where: { id: videoId },
        data: {
          status: 'FAILED',
          aiSummary: `Erro no processamento: ${error.message}`,
        },
      });

      throw error;
    }
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

  private async transcode(
    inputPath: string,
    outputPath: string,
    resolution: typeof this.RESOLUTIONS[0],
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-profile:v', 'main',
        '-level', '4.0',
        '-b:v', resolution.bitrate,
        '-maxrate', resolution.maxrate,
        '-bufsize', resolution.bufsize,
        '-vf', `scale=w=${resolution.width}:h=${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2`,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '48000',
        '-movflags', '+faststart',
        '-y',
        outputPath,
      ]);

      let errorOutput = '';
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          this.logger.error(`Transcode error: ${errorOutput}`);
          reject(new Error(`Transcode failed with code ${code}`));
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
  ): Promise<void> {
    // Gerar variantes HLS
    const args = [
      '-i', inputPath,
      ...resolutions.flatMap((res, i) => [
        '-map', '0:v:0',
        '-map', '0:a:0',
        `-c:v:${i}`, 'libx264',
        `-b:v:${i}`, res.bitrate,
        `-maxrate:v:${i}`, res.maxrate,
        `-bufsize:v:${i}`, res.bufsize,
        `-vf:${i}`, `scale=w=${res.width}:h=${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2`,
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

  // ==================== Storage Operations ====================

  private async downloadFromStorage(storageKey: string, outputPath: string): Promise<void> {
    const buffer = await this.storage.download(storageKey);
    await fs.writeFile(outputPath, buffer);
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
    return this.RESOLUTIONS.filter(
      (res) => res.height <= videoInfo.height,
    );
  }

  private async reportProgress(
    onProgress: ((progress: number) => Promise<void>) | undefined,
    progress: number,
  ): Promise<void> {
    if (onProgress) {
      await onProgress(progress);
    }
  }
}
