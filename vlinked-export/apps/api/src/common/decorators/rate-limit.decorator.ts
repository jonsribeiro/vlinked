import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  windowMs: number; // Janela de tempo em ms
  max: number;      // Máximo de requisições
  keyPrefix?: string; // Prefixo para a chave no Redis
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
