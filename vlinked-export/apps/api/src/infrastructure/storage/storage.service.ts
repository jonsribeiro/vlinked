import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

export interface StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
  forcePathStyle?: boolean;
}

export interface PresignedUrlOptions {
  key: string;
  contentType?: string;
  contentLength?: number;
  expiresIn?: number;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  key: string;
  url: string;
  etag?: string;
}

/**
 * Serviço de storage S3-compatible
 * 
 * Suporta: AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces, etc.
 * 
 * Configuração via env:
 * - STORAGE_PROVIDER=s3|r2|minio
 * - STORAGE_ENDPOINT=https://xxx.r2.cloudflarestorage.com (para R2/MinIO)
 * - STORAGE_REGION=auto (R2) ou us-east-1 (S3)
 * - STORAGE_BUCKET=vlinked-uploads
 * - STORAGE_ACCESS_KEY_ID=xxx
 * - STORAGE_SECRET_ACCESS_KEY=xxx
 * - STORAGE_PUBLIC_URL=https://cdn.vlinked.com (ou https://bucket.s3.amazonaws.com)
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly config: StorageConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfig();
    this.client = this.createClient();
    this.logger.log(`Storage configurado: ${this.config.endpoint || 'AWS S3'} (bucket: ${this.config.bucket})`);
  }

  private loadConfig(): StorageConfig {
    const provider = this.configService.get('STORAGE_PROVIDER') || 's3';
    const endpoint = this.configService.get('STORAGE_ENDPOINT');
    
    return {
      endpoint,
      region: this.configService.get('STORAGE_REGION') || 'us-east-1',
      bucket: this.configService.get('STORAGE_BUCKET') || 'vlinked-uploads',
      accessKeyId: this.configService.get('STORAGE_ACCESS_KEY_ID') || '',
      secretAccessKey: this.configService.get('STORAGE_SECRET_ACCESS_KEY') || '',
      publicUrl: this.configService.get('STORAGE_PUBLIC_URL') || '',
      forcePathStyle: provider === 'minio' || !!endpoint,
    };
  }

  private createClient(): S3Client {
    const clientConfig: any = {
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    };

    // Adicionar endpoint para R2, MinIO, etc
    if (this.config.endpoint) {
      clientConfig.endpoint = this.config.endpoint;
      clientConfig.forcePathStyle = this.config.forcePathStyle;
    }

    return new S3Client(clientConfig);
  }

  /**
   * Gera URL pré-assinada para upload
   */
  async generatePresignedUrl(options: PresignedUrlOptions): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: options.key,
      ContentType: options.contentType,
      ContentLength: options.contentLength,
      Metadata: options.metadata,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: options.expiresIn || 900, // 15 minutos padrão
    });
  }

  /**
   * Faz upload de buffer
   */
  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<UploadResult> {
    const parallelUploads = new Upload({
      client: this.client,
      params: {
        Bucket: this.config.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: metadata,
      },
      queueSize: 4,
      partSize: 5 * 1024 * 1024, // 5MB
    });

    const result = await parallelUploads.done();

    return {
      key,
      url: this.getPublicUrl(key),
      etag: result.ETag,
    };
  }

  /**
   * Faz upload de stream
   */
  async uploadStream(
    key: string,
    stream: Readable,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<UploadResult> {
    const parallelUploads = new Upload({
      client: this.client,
      params: {
        Bucket: this.config.bucket,
        Key: key,
        Body: stream,
        ContentType: contentType,
        Metadata: metadata,
      },
      queueSize: 4,
      partSize: 5 * 1024 * 1024,
    });

    const result = await parallelUploads.done();

    return {
      key,
      url: this.getPublicUrl(key),
      etag: result.ETag,
    };
  }

  /**
   * Download para arquivo local
   */
  async downloadToFile(key: string, outputPath: string): Promise<void> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });

    const response = await this.client.send(command);
    const stream = response.Body as Readable;

    const { createWriteStream } = await import('fs');
    const writeStream = createWriteStream(outputPath);

    return new Promise((resolve, reject) => {
      stream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  }

  /**
   * Download para buffer
   */
  async downloadToBuffer(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });

    const response = await this.client.send(command);
    const stream = response.Body as Readable;

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  /**
   * Retorna stream de leitura
   */
  async getStream(key: string): Promise<Readable> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });

    const response = await this.client.send(command);
    return response.Body as Readable;
  }

  /**
   * Deleta objeto
   */
  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      }),
    );
  }

  /**
   * Verifica se objeto existe
   */
  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retorna URL pública do objeto
   */
  getPublicUrl(key: string): string {
    if (this.config.publicUrl) {
      return `${this.config.publicUrl}/${key}`;
    }
    // Fallback para URL S3 padrão
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
  }

  /**
   * Retorna configuração atual
   */
  getConfig(): StorageConfig {
    return { ...this.config };
  }

  /**
   * Retorna nome do bucket
   */
  getBucket(): string {
    return this.config.bucket;
  }
}
