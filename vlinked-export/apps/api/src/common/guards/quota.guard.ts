import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { QuotaService } from '../../modules/quota/quota.service';
import { REQUIRE_QUOTA_KEY, RequireQuotaOptions } from '../decorators/require-quota.decorator';
import { AuthenticatedUser } from '../../modules/auth/strategies/jwt.strategy';

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private quotaService: QuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const quotaOptions = this.reflector.getAllAndOverride<RequireQuotaOptions>(
      REQUIRE_QUOTA_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Se não houver decorator de quota, permite
    if (!quotaOptions) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const { resource, amount } = quotaOptions;

    switch (resource) {
      case 'upload': {
        const check = await this.quotaService.checkUploadQuota(user.userId);
        if (!check.allowed) {
          throw new ForbiddenException(
            `Limite de uploads atingido. Limite: ${check.limit}, Usado: ${check.used}`
          );
        }
        break;
      }

      case 'ai': {
        const check = await this.quotaService.checkAIQuota(user.userId);
        if (!check.allowed) {
          throw new ForbiddenException(
            `Limite de análises IA atingido. Limite: ${check.limit}, Usado: ${check.used}`
          );
        }
        break;
      }

      case 'storage': {
        const fileSizeGB = amount || 0;
        const check = await this.quotaService.checkStorageQuota(user.userId, fileSizeGB);
        if (!check.allowed) {
          throw new ForbiddenException(
            `Espaço de storage insuficiente. Disponível: ${check.remaining.toFixed(2)}GB`
          );
        }
        break;
      }

      default:
        throw new ForbiddenException('Recurso de quota desconhecido');
    }

    return true;
  }
}
