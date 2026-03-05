import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export const appConfigValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string()
    .valid('debug', 'info', 'warn', 'error')
    .default('info'),
  CORRELATION_ID_HEADER: Joi.string().default('x-correlation-id'),
  CORS_ORIGIN: Joi.string().optional(),
});

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  logLevel: process.env.LOG_LEVEL || 'info',
  correlationIdHeader: process.env.CORRELATION_ID_HEADER || 'x-correlation-id',
  corsOrigin: process.env.CORS_ORIGIN,
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
}));
