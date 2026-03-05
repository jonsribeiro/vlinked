import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface AIAnalysisResult {
  videoId: string;
  transcription: string;
  summary: string;
  tags: string[];
  keyMoments: KeyMoment[];
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  topics: string[];
  skills: string[];
  confidence: number;
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
 * Serviço de análise de IA para vídeos
 * 
 * Responsabilidades:
 * - Transcrição de áudio (Speech-to-Text)
 * - Geração de resumo
 * - Extração de tags e tópicos
 * - Identificação de key moments
 * - Análise de sentimento
 * - Extração de skills mencionadas
 * 
 * Implementação: Integração com OpenAI Whisper + GPT-4
 * 
 * NOTA: Este serviço é chamado pelo AIAnalysisWorker (fila BullMQ)
 * Não deve ser chamado diretamente do servidor principal
 */
@Injectable()
export class AIAnalysisService {
  private readonly logger = new Logger(AIAnalysisService.name);
  private readonly openaiApiKey: string;
  private readonly useMock: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.openaiApiKey = this.config.get('OPENAI_API_KEY') || '';
    this.useMock = !this.openaiApiKey || this.config.get('AI_MOCK_ENABLED') === 'true';
  }

  /**
   * Analisa vídeo completo
   * 
   * @param videoId ID do vídeo
   * @param storageKey Chave no storage (R2/S3)
   * @param onProgress Callback para reportar progresso (0-100)
   */
  async analyzeVideo(
    videoId: string,
    storageKey: string,
    onProgress?: (progress: number) => Promise<void>,
  ): Promise<AIAnalysisResult> {
    if (this.useMock) {
      this.logger.debug(`Usando mock analysis: ${videoId}`);
      await this.reportProgress(onProgress, 100);
      return this.mockAnalysis(videoId);
    }

    // 1. Extrair áudio do vídeo
    this.logger.debug(`Extraindo áudio: ${videoId}`);
    await this.reportProgress(onProgress, 10);
    const audioBuffer = await this.extractAudio(storageKey);

    // 2. Transcrever com Whisper
    this.logger.debug(`Transcrevendo: ${videoId}`);
    await this.reportProgress(onProgress, 40);
    const transcription = await this.transcribeWithWhisper(audioBuffer);

    // 3. Analisar conteúdo com GPT-4
    this.logger.debug(`Analisando conteúdo: ${videoId}`);
    await this.reportProgress(onProgress, 70);
    const analysis = await this.analyzeWithGPT(transcription.text);

    await this.reportProgress(onProgress, 100);

    // Salvar resultados no banco
    await this.prisma.video.update({
      where: { id: videoId },
      data: {
        transcription: transcription.text,
        aiSummary: analysis.summary,
        aiTags: analysis.tags,
        keyMoments: analysis.keyMoments as any,
        sentiment: analysis.sentiment,
      },
    });

    // Emitir evento para indexação no feed
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { userId: true },
    });

    if (video) {
      this.eventEmitter.emit('video.analyzed', {
        videoId,
        userId: video.userId,
        analysis: {
          tags: analysis.tags,
          sentiment: analysis.sentiment,
          topics: analysis.topics,
          skills: analysis.skills,
        },
      });
    }

    this.logger.log(`Análise de IA concluída: ${videoId}`);

    return {
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

  /**
   * Transcreve áudio usando OpenAI Whisper
   */
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

  /**
   * Analisa transcrição com GPT-4
   */
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

  /**
   * Extrai áudio do vídeo no storage
   * Em produção: usar FFmpeg para extrair áudio
   */
  private async extractAudio(storageKey: string): Promise<Buffer> {
    // Download vídeo do storage
    const videoBuffer = await this.storage.download(storageKey);
    
    // TODO: Implementar extração de áudio com FFmpeg
    // Por enquanto, retornar o vídeo completo (Whisper aceita vídeo também)
    return videoBuffer;
  }

  // ==================== Mock Implementation ====================

  private mockAnalysis(videoId: string): AIAnalysisResult {
    const mockData = {
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
      sentiment: 'POSITIVE' as const,
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

    return {
      videoId,
      ...mockData,
    };
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
