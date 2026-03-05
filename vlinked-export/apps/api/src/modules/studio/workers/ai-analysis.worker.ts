import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface AIAnalysisJob {
  videoId: string;
  userId: string;
  s3Key: string;
  hlsUrl: string;
}

export interface KeyMoment {
  timestamp: number;
  description: string;
  importance: number;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

/**
 * Worker de análise de IA
 * 
 * Fila: ai-analysis
 * Responsabilidades:
 * - Transcrição de áudio (Speech-to-Text)
 * - Geração de resumo
 * - Extração de tags e tópicos
 * - Identificação de key moments
 * - Análise de sentimento
 * - Extração de skills mencionadas
 * 
 * Implementação: OpenAI Whisper + GPT-4
 */
@Processor('ai-analysis', {
  concurrency: 3, // Processar 3 análises simultaneamente
  limiter: {
    max: 20, // Máximo 20 jobs por minuto (rate limit da API)
    duration: 60000,
  },
})
export class AIAnalysisWorker extends WorkerHost {
  private readonly logger = new Logger(AIAnalysisWorker.name);
  private readonly openaiApiKey: string;
  private readonly useMock: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.useMock = !this.openaiApiKey || process.env.AI_MOCK_ENABLED === 'true';
  }

  async process(job: Job<AIAnalysisJob>): Promise<any> {
    const { videoId, userId, s3Key, hlsUrl } = job.data;
    
    this.logger.log(`[${job.id}] Iniciando análise de IA: ${videoId}`);
    await job.updateProgress(10);

    try {
      let result;

      if (this.useMock) {
        this.logger.debug(`[${job.id}] Usando mock analysis`);
        await this.delay(1000); // Simular processamento
        result = this.mockAnalysis(videoId);
      } else {
        // 1. Extrair áudio do vídeo
        this.logger.debug(`[${job.id}] Extraindo áudio`);
        const audioBuffer = await this.extractAudio(s3Key);
        await job.updateProgress(30);

        // 2. Transcrever com Whisper
        this.logger.debug(`[${job.id}] Transcrevendo com Whisper`);
        const transcription = await this.transcribeWithWhisper(audioBuffer);
        await job.updateProgress(60);

        // 3. Analisar conteúdo com GPT-4
        this.logger.debug(`[${job.id}] Analisando com GPT-4`);
        const analysis = await this.analyzeWithGPT(transcription.text);
        await job.updateProgress(90);

        result = {
          videoId,
          transcription: transcription.text,
          summary: analysis.summary,
          tags: analysis.tags,
          keyMoments: analysis.keyMoments,
          sentiment: analysis.sentiment,
          topics: analysis.topics,
          skills: analysis.skills,
          confidence: transcription.confidence,
        };
      }

      // Salvar resultados no banco
      await this.prisma.video.update({
        where: { id: videoId },
        data: {
          transcription: result.transcription,
          aiSummary: result.summary,
          aiTags: result.tags,
          keyMoments: result.keyMoments as any,
          sentiment: result.sentiment,
        },
      });

      await job.updateProgress(100);

      // Emitir evento para indexação no feed
      this.eventEmitter.emit('video.analyzed', {
        videoId,
        userId,
        analysis: result,
      });

      this.logger.log(`[${job.id}] Análise de IA concluída: ${videoId}`);

      return {
        success: true,
        videoId,
        tags: result.tags.length,
        confidence: result.confidence,
      };
    } catch (error) {
      this.logger.error(`[${job.id}] Erro na análise de IA: ${videoId}`, error);
      
      // Não falhar o vídeo se a análise falhar
      // Apenas logar e continuar com o feed indexer
      this.eventEmitter.emit('video.analyzed', {
        videoId,
        userId,
        analysis: null,
        error: error.message,
      });

      return {
        success: false,
        videoId,
        error: error.message,
      };
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`[${job.id}] Job de análise completado: ${job.data.videoId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`[${job.id}] Job de análise falhou: ${job.data.videoId}`, error);
  }

  // ==================== OpenAI Integration ====================

  private async transcribeWithWhisper(
    audioBuffer: Buffer,
  ): Promise<{ text: string; confidence: number; segments: TranscriptionSegment[] }> {
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    
    formData.append('file', audioBuffer, { filename: 'audio.mp3' });
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`,
        ...formData.getHeaders(),
      },
      body: formData as any,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Whisper API error: ${error}`);
    }

    const result = await response.json();

    return {
      text: result.text,
      confidence: result.segments?.reduce((acc: number, s: any) => acc + (s.avg_logprob || 0), 0) / 
        (result.segments?.length || 1),
      segments: result.segments?.map((s: any) => ({
        start: s.start,
        end: s.end,
        text: s.text,
        confidence: s.avg_logprob,
      })) || [],
    };
  }

  private async analyzeWithGPT(transcription: string): Promise<{
    summary: string;
    tags: string[];
    keyMoments: KeyMoment[];
    sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    topics: string[];
    skills: string[];
  }> {
    const prompt = `Analise o seguinte vídeo de plataforma profissional (tipo LinkedIn) e forneça:

1. Resumo em 2-3 frases
2. Tags relevantes (máximo 10)
3. Momentos-chave com timestamp (máximo 5)
4. Sentimento geral (POSITIVE/NEUTRAL/NEGATIVE)
5. Tópicos principais (máximo 5)
6. Skills mencionadas (máximo 10)

Transcrição:
"""${transcription}"""

Responda em JSON no formato:
{
  "summary": "...",
  "tags": ["tag1", "tag2", ...],
  "keyMoments": [{"timestamp": 120, "description": "...", "importance": 0.9}, ...],
  "sentiment": "POSITIVE",
  "topics": ["topic1", ...],
  "skills": ["skill1", ...]
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: 'Você é um assistente especializado em análise de conteúdo profissional.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GPT API error: ${error}`);
    }

    const result = await response.json();
    const content = JSON.parse(result.choices[0].message.content);

    return {
      summary: content.summary,
      tags: content.tags || [],
      keyMoments: content.keyMoments || [],
      sentiment: content.sentiment || 'NEUTRAL',
      topics: content.topics || [],
      skills: content.skills || [],
    };
  }

  // ==================== Audio Extraction ====================

  private async extractAudio(s3Key: string): Promise<Buffer> {
    // Download vídeo do storage
    return this.storage.downloadToBuffer(s3Key);
    // Nota: Em produção, extrair áudio com FFmpeg antes de enviar para Whisper
    // Whisper também aceita vídeo diretamente
  }

  // ==================== Mock Implementation ====================

  private mockAnalysis(videoId: string): {
    videoId: string;
    transcription: string;
    summary: string;
    tags: string[];
    keyMoments: KeyMoment[];
    sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    topics: string[];
    skills: string[];
    confidence: number;
  } {
    return {
      videoId,
      transcription: `Olá, sou desenvolvedor full stack com 5 anos de experiência. 
        Trabalhei com React, Node.js e TypeScript em diversos projetos. 
        Meu último projeto foi uma plataforma de e-commerce que processou mais de 1 milhão de pedidos.
        Sou apaixonado por código limpo e arquitetura escalável.`,
      summary: 'Desenvolvedor full stack experiente compartilha sua trajetória e projetos, destacando expertise em React, Node.js e arquitetura escalável.',
      tags: [
        'desenvolvimento',
        'fullstack',
        'react',
        'nodejs',
        'typescript',
        'ecommerce',
        'carreira',
        'tecnologia',
        'programação',
        'experiência',
      ],
      keyMoments: [
        { timestamp: 5, description: 'Apresentação profissional', importance: 0.9 },
        { timestamp: 30, description: 'Tecnologias principais', importance: 0.85 },
        { timestamp: 60, description: 'Projeto em destaque', importance: 0.95 },
        { timestamp: 90, description: 'Filosofia de trabalho', importance: 0.7 },
      ],
      sentiment: 'POSITIVE',
      topics: [
        'desenvolvimento de software',
        'carreira em tecnologia',
        'projetos',
        'tecnologias',
        'experiência profissional',
      ],
      skills: [
        'React',
        'Node.js',
        'TypeScript',
        'Full Stack Development',
        'Arquitetura de Software',
        'E-commerce',
        'JavaScript',
        'Clean Code',
        'Scalability',
        'Web Development',
      ],
      confidence: 0.92,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
