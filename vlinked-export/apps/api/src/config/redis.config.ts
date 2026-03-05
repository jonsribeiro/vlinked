import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export const redisConfigValidationSchema = Joi.object({
  REDIS_URL: Joi.string().uri().required(),
});

export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL,
}));
