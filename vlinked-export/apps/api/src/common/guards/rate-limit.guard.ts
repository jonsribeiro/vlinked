import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rateLimitOptions = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Se não houver decorator de rate limit, permite
    if (!rateLimitOptions) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const identifier = this.getIdentifier(request, rateLimitOptions.keyPrefix);

    const { windowMs, max } = rateLimitOptions;
    const windowSeconds = Math.ceil(windowMs / 1000);

    // Incrementar contador no Redis
    const current = await this.redis.increment(identifier);

    // Se for a primeira requisição, definir TTL
    if (current === 1) {
      await this.redis.expire(identifier, windowSeconds);
    }

    // Verificar se excedeu o limite
    if (current > max) {
      const ttl = await this.redis.ttl(identifier);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Muitas requisições. Tente novamente mais tarde.',
          retryAfter: ttl,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getIdentifier(request: Request, keyPrefix?: string): string {
    // Usar IP do usuário como identificador
    const ip = request.ip || request.connection.remoteAddress || 'unknown';
    const prefix = keyPrefix || 'rate_limit';
    const route = request.route?.path || request.path;

    return `${prefix}:${ip}:${route}`;
  }
}
