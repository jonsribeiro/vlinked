import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export const databaseConfigValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().uri().required(),
});

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL,
}));
