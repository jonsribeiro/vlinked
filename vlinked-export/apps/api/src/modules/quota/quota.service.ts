import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { QuotaTier } from '@prisma/client';

export type QuotaResource = 'upload' | 'ai' | 'storage';

export interface QuotaCheck {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
}

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  // Limites por tier
  private readonly tierLimits = {
    FREE: {
      maxVideoUploads: 5,
      maxVideoDuration: 180, // 3 minutos
      maxStorageGB: 1,
      maxAIAnalysis: 3,
    },
    PRO: {
      maxVideoUploads: -1, // Ilimitado
      maxVideoDuration: 600, // 10 minutos
      maxStorageGB: 50,
      maxAIAnalysis: 50,
    },
    ENTERPRISE: {
      maxVideoUploads: -1, // Ilimitado
      maxVideoDuration: 1800, // 30 minutos
      maxStorageGB: 500,
      maxAIAnalysis: 500,
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria quota para um novo usuário
   */
  async createForUser(userId: string, tier: QuotaTier = QuotaTier.FREE) {
    const limits = this.tierLimits[tier];

    const quota = await this.prisma.userQuota.create({
      data: {
        userId,
        tier,
        maxVideoUploads: limits.maxVideoUploads,
        maxVideoDuration: limits.maxVideoDuration,
        maxStorageGB: limits.maxStorageGB,
        maxAIAnalysis: limits.maxAIAnalysis,
      },
    });

    this.logger.log(`Quota criada para usuário: ${userId} (tier: ${tier})`);

    return quota;
  }

  /**
   * Busca quota do usuário
   */
  async getQuota(userId: string) {
    const quota = await this.prisma.userQuota.findUnique({
      where: { userId },
    });

    if (!quota) {
      throw new NotFoundException('Quota não encontrada');
    }

    return quota;
  }

  /**
   * Verifica se usuário pode fazer upload
   */
  async checkUploadQuota(userId: string): Promise<QuotaCheck> {
    const quota = await this.getQuota(userId);

    // Verificar se precisa resetar (mensal)
    await this.checkAndResetIfNeeded(quota);

    const limit = quota.maxVideoUploads;
    const used = quota.uploadsUsed;

    // -1 significa ilimitado
    if (limit === -1) {
      return { allowed: true, remaining: -1, limit: -1, used };
    }

    const remaining = limit - used;
    const allowed = remaining > 0;

    return { allowed, remaining, limit, used };
  }

  /**
   * Verifica se usuário pode usar IA
   */
  async checkAIQuota(userId: string): Promise<QuotaCheck> {
    const quota = await this.getQuota(userId);

    await this.checkAndResetIfNeeded(quota);

    const limit = quota.maxAIAnalysis;
    const used = quota.aiUsed;

    if (limit === -1) {
      return { allowed: true, remaining: -1, limit: -1, used };
    }

    const remaining = limit - used;
    const allowed = remaining > 0;

    return { allowed, remaining, limit, used };
  }

  /**
   * Verifica se usuário tem espaço de storage disponível
   */
  async checkStorageQuota(userId: string, fileSizeGB: number): Promise<QuotaCheck> {
    const quota = await this.getQuota(userId);

    const limit = quota.maxStorageGB.toNumber();
    const used = quota.storageUsedGB.toNumber();

    if (limit === -1) {
      return { allowed: true, remaining: -1, limit: -1, used };
    }

    const remaining = limit - used;
    const allowed = remaining >= fileSizeGB;

    return { allowed, remaining, limit, used };
  }

  /**
   * Incrementa contador de uploads
   */
  async incrementUploads(userId: string): Promise<void> {
    await this.prisma.userQuota.update({
      where: { userId },
      data: { uploadsUsed: { increment: 1 } },
    });
  }

  /**
   * Incrementa contador de análises IA
   */
  async incrementAI(userId: string): Promise<void> {
    await this.prisma.userQuota.update({
      where: { userId },
      data: { aiUsed: { increment: 1 } },
    });
  }

  /**
   * Adiciona storage usado
   */
  async addStorage(userId: string, sizeGB: number): Promise<void> {
    await this.prisma.userQuota.update({
      where: { userId },
      data: {
        storageUsedGB: { increment: sizeGB },
      },
    });
  }

  /**
   * Remove storage usado
   */
  async removeStorage(userId: string, sizeGB: number): Promise<void> {
    await this.prisma.userQuota.update({
      where: { userId },
      data: {
        storageUsedGB: { decrement: sizeGB },
      },
    });
  }

  /**
   * Reseta contadores mensais
   */
  async resetMonthlyCounters(userId: string): Promise<void> {
    await this.prisma.userQuota.update({
      where: { userId },
      data: {
        uploadsUsed: 0,
        aiUsed: 0,
        lastResetAt: new Date(),
      },
    });

    this.logger.log(`Contadores resetados para usuário: ${userId}`);
  }

  /**
   * Atualiza tier do usuário
   */
  async updateTier(userId: string, tier: QuotaTier): Promise<void> {
    const limits = this.tierLimits[tier];

    await this.prisma.userQuota.update({
      where: { userId },
      data: {
        tier,
        maxVideoUploads: limits.maxVideoUploads,
        maxVideoDuration: limits.maxVideoDuration,
        maxStorageGB: limits.maxStorageGB,
        maxAIAnalysis: limits.maxAIAnalysis,
      },
    });

    this.logger.log(`Tier atualizado: ${userId} -> ${tier}`);
  }

  /**
   * Verifica se precisa resetar contadores (mensal)
   */
  private async checkAndResetIfNeeded(quota: any): Promise<void> {
    const now = new Date();
    const lastReset = new Date(quota.lastResetAt);
    
    // Verificar se passou 1 mês desde o último reset
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    
    if (lastReset < oneMonthAgo) {
      await this.resetMonthlyCounters(quota.userId);
    }
  }
}
