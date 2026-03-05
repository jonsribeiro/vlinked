import { Controller, Post, Headers, Body, Param, UnauthorizedException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { UploadService, UploadStatus } from '../upload/upload.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHmac } from 'crypto';

/**
 * Webhooks para integrações externas
 * 
 * Endpoints:
 * - S3: Notificações de upload completo
 * - VirusTotal: Resultados de scan
 * - Mux: Eventos de processamento de vídeo
 * - Stripe: Eventos de pagamento
 */
@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly uploadService: UploadService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ==================== S3 Webhook ====================

  @Post('s3')
  @ApiOperation({ summary: 'Webhook para eventos S3 (SNS)' })
  async handleS3Webhook(
    @Body() payload: any,
    @Headers('x-amz-sns-message-type') messageType: string,
  ) {
    this.logger.debug('S3 webhook recebido', { messageType });

    // Verificar assinatura SNS (em produção)
    // await this.verifySNSSignature(payload);

    if (messageType === 'SubscriptionConfirmation') {
      // Confirmar subscription
      this.logger.log(`Confirmando subscription: ${payload.SubscribeURL}`);
      // await fetch(payload.SubscribeURL);
      return { message: 'Subscription confirmada' };
    }

    if (messageType === 'Notification') {
      const message = JSON.parse(payload.Message);
      
      if (message.eventName?.includes('ObjectCreated')) {
        const s3Key = message.s3?.object?.key;
        const sessionId = message.requestParameters?.['x-amz-meta-session-id'];
        
        if (sessionId && s3Key) {
          this.logger.log(`Upload S3 confirmado: ${s3Key}`);
          
          // Extrair userId da chave (uploads/{userId}/...)
          const userId = s3Key.split('/')[1];
          
          // Confirmar upload
          try {
            await this.uploadService.confirmUpload(sessionId, userId);
          } catch (error) {
            this.logger.error(`Erro ao confirmar upload: ${sessionId}`, error);
          }
        }
      }
    }

    return { received: true };
  }

  // ==================== VirusTotal Webhook ====================

  @Post('virustotal')
  @ApiOperation({ summary: 'Webhook para resultados VirusTotal' })
  async handleVirusTotalWebhook(
    @Body() payload: {
      data: {
        attributes: {
          status: 'completed' | 'queued';
          stats: {
            malicious: number;
            suspicious: number;
            undetected: number;
          };
          results?: Record<string, {
            category: string;
            result: string;
          }>;
        };
      };
      meta: {
        sessionId: string;
      };
    },
    @Headers('x-virustotal-signature') signature: string,
  ) {
    // Verificar assinatura (em produção)
    // this.verifyVirusTotalSignature(payload, signature);

    const { data, meta } = payload;
    
    if (data.attributes.status === 'completed') {
      const isInfected = 
        data.attributes.stats.malicious > 0 || 
        data.attributes.stats.suspicious > 0;

      const threats = isInfected 
        ? Object.entries(data.attributes.results || {})
            .filter(([_, result]) => 
              result.category === 'malicious' || result.category === 'suspicious'
            )
            .map(([engine, result]) => `${engine}: ${result.result}`)
        : undefined;

      await this.uploadService.updateScanStatus(
        meta.sessionId,
        isInfected ? UploadStatus.INFECTED : UploadStatus.CLEAN,
        {
          engine: 'VirusTotal',
          threats,
          scannedAt: new Date(),
        },
      );

      this.logger.log(`Scan VirusTotal: ${meta.sessionId} - ${isInfected ? 'INFECTED' : 'CLEAN'}`);
    }

    return { received: true };
  }

  // ==================== Mux Webhook ====================

  @Post('mux')
  @ApiOperation({ summary: 'Webhook para eventos Mux' })
  async handleMuxWebhook(
    @Body() payload: {
      type: string;
      data: {
        id: string;
        status?: string;
        playback_ids?: { id: string }[];
        tracks?: { type: string; max_width?: number; max_height?: number; duration?: number }[];
        errors?: { type: string; message: string }[];
      };
    },
    @Headers('mux-signature') signature: string,
  ) {
    // Verificar assinatura Mux
    // this.verifyMuxSignature(payload, signature);

    this.logger.debug('Mux webhook', { type: payload.type });

    switch (payload.type) {
      case 'video.asset.created':
        // Asset criado
        break;

      case 'video.asset.ready':
        // Processamento completo
        this.eventEmitter.emit('mux.asset.ready', {
          assetId: payload.data.id,
          playbackId: payload.data.playback_ids?.[0]?.id,
          resolution: payload.data.tracks?.find(t => t.type === 'video')
            ? `${payload.data.tracks[0].max_width}x${payload.data.tracks[0].max_height}`
            : undefined,
          duration: payload.data.tracks?.find(t => t.type === 'video')?.duration,
        });
        break;

      case 'video.asset.errored':
        // Erro no processamento
        this.logger.error('Mux processing error', payload.data.errors);
        break;

      case 'video.asset.deleted':
        // Asset deletado
        break;
    }

    return { received: true };
  }

  // ==================== Stripe Webhook ====================

  @Post('stripe')
  @ApiOperation({ summary: 'Webhook para eventos Stripe' })
  async handleStripeWebhook(
    @Body() payload: any,
    @Headers('stripe-signature') signature: string,
  ) {
    const webhookSecret = this.config.get('STRIPE_WEBHOOK_SECRET');
    
    if (!webhookSecret) {
      throw new UnauthorizedException('Webhook secret não configurado');
    }

    // Verificar assinatura Stripe
    // const stripe = new Stripe(...);
    // const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    this.logger.debug('Stripe webhook', { type: payload.type });

    switch (payload.type) {
      case 'checkout.session.completed':
        // Pagamento bem-sucedido
        this.eventEmitter.emit('payment.succeeded', {
          userId: payload.data.object.client_reference_id,
          subscriptionId: payload.data.object.subscription,
          customerId: payload.data.object.customer,
        });
        break;

      case 'invoice.payment_failed':
        // Falha no pagamento
        this.logger.warn('Pagamento falhou', payload.data.object);
        break;

      case 'customer.subscription.deleted':
        // Cancelamento de assinatura
        this.eventEmitter.emit('subscription.cancelled', {
          subscriptionId: payload.data.object.id,
          customerId: payload.data.object.customer,
        });
        break;
    }

    return { received: true };
  }

  // ==================== Generic Processing Webhook ====================

  @Post('processing/:provider')
  @ApiOperation({ summary: 'Webhook genérico para processadores de vídeo' })
  async handleProcessingWebhook(
    @Param('provider') provider: string,
    @Body() payload: any,
  ) {
    this.logger.log(`Processing webhook: ${provider}`, payload);

    // Roteamento baseado no provider
    switch (provider) {
      case 'aws-mediaconvert':
        // AWS MediaConvert job completion
        if (payload.detail?.status === 'COMPLETE') {
          this.eventEmitter.emit('processing.complete', {
            jobId: payload.detail.jobId,
            outputGroupDetails: payload.detail.outputGroupDetails,
          });
        }
        break;

      case 'cloudflare-stream':
        // Cloudflare Stream webhook
        if (payload.status === 'ready') {
          this.eventEmitter.emit('processing.complete', {
            uid: payload.uid,
            playbackUrl: payload.playback?.hls,
            thumbnail: payload.thumbnail,
          });
        }
        break;

      default:
        this.logger.warn(`Provider desconhecido: ${provider}`);
    }

    return { received: true };
  }

  // ==================== Signature Verification ====================

  private verifyVirusTotalSignature(payload: any, signature: string): void {
    const secret = this.config.get('VIRUSTOTAL_WEBHOOK_SECRET');
    if (!secret) return;

    const expected = createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (signature !== expected) {
      throw new UnauthorizedException('Assinatura inválida');
    }
  }

  private verifyMuxSignature(payload: any, signature: string): void {
    const secret = this.config.get('MUX_WEBHOOK_SECRET');
    if (!secret) return;

    // Mux usa JWT para assinatura
    // Implementar verificação JWT
  }
}
