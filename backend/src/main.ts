import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as express from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { CorrelationIdInterceptor } from './common/interceptors/correlation-id.interceptor';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    app.setGlobalPrefix('api/v1');

    // Body size limit — prevents payload amplification attacks
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ limit: '1mb', extended: true }));

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new CorrelationIdInterceptor());
    app.useWebSocketAdapter(new IoAdapter(app));

    const swaggerConfig = new DocumentBuilder()
      .setTitle('IoT Proxy API')
      .setVersion('1.0')
      .setDescription('Multi-tenant IoT data ingestion and normalization platform')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'api-key')
      .build();

    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );

    // Graceful shutdown
    app.enableShutdownHooks();

    await app.listen(3000, '0.0.0.0');
    console.log('🚀 Application is running on: http://localhost:3000');
    console.log('📚 API Documentation: http://localhost:3000/api/docs');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('❌ Failed to start application:', err.message);
    console.error('Stack trace:', err.stack);
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  console.error('❌ Unhandled error during bootstrap:', error);
  process.exit(1);
});
