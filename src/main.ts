import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that do not have any decorators
    }),
  );

  // Enable CORS for your Next.js frontend
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3001);
  console.log('🚀 Family Tree API running on: http://localhost:3001');
}

bootstrap().catch((err) => {
  console.error('Error starting application:', err);
  process.exit(1);
});
