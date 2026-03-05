import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  
  const configService = app.get(ConfigService);
  
  // Use Pino logger
  app.useLogger(app.get(Logger));

  // Initialize Sentry
  const sentryDsn = configService.get<string>('SENTRY_DSN');
  if (sentryDsn && sentryDsn !== 'mock') {
    Sentry.init({
      dsn: sentryDsn,
      environment: configService.get('NODE_ENV') || 'development',
      release: configService.get('npm_package_version') || '1.0.0',
      integrations: [
        nodeProfilingIntegration(),
      ],
      // Performance Monitoring
      tracesSampleRate: configService.get('NODE_ENV') === 'production' ? 0.1 : 1.0,
      // Profiling
      profilesSampleRate: configService.get('NODE_ENV') === 'production' ? 0.1 : 1.0,
    });
    
    // Setup Sentry error handler
    Sentry.setupNestErrorHandler(app);
  }

  // Security
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }));
  app.use(compression());

  // CORS
  app.enableCors({
    origin: configService.get('CORS_ORIGIN') || true,
    credentials: true,
  });

  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('VLinked API')
    .setDescription('Plataforma global de negócios baseada em vídeo')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document);

  // Port
  const port = configService.get<number>('PORT', 3000);
  
  await app.listen(port);
  
  const logger = app.get(Logger);
  logger.log(`🚀 VLinked API running on port ${port}`);
  logger.log(`📚 Swagger docs available at http://localhost:${port}/api-docs`);
  logger.log(`💚 Health check at http://localhost:${port}/health`);
}

bootstrap();
