import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { CORRELATION_ID_KEY } from './correlation-id.interceptor';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();
    const correlationId = request[CORRELATION_ID_KEY];
    
    const startTime = Date.now();
    const { method, url, body, query, params } = request;
    const userAgent = request.get('user-agent') || '';
    const ip = request.ip;

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode;

        const logData = {
          timestamp: new Date().toISOString(),
          level: statusCode >= 400 ? 'warn' : 'info',
          correlationId,
          method,
          url,
          statusCode,
          duration: `${duration}ms`,
          userAgent,
          ip,
          body: this.sanitizeBody(body),
          query,
          params,
        };

        // In development, log to console
        if (process.env.NODE_ENV === 'development') {
          console.log(JSON.stringify(logData, null, 2));
        }
      }),
    );
  }

  private sanitizeBody(body: any): any {
    if (!body) return body;
    
    const sensitiveFields = ['password', 'passwordHash', 'token', 'secret'];
    const sanitized = { ...body };
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***';
      }
    }
    
    return sanitized;
  }
}
