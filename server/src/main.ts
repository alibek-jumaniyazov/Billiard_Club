import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Reverse proxy (nginx/Caddy) ortida to'g'ri IP aniqlash — rate limit uchun muhim
  app.set('trust proxy', 1);

  app.use(helmet());
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  app.setGlobalPrefix('api', { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTOda yo'q maydonlar olib tashlanadi (mass-assignment himoyasi)
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Xotirjam o'chirish: ulanishlar yopilib, DB pool bo'shatiladi
  app.enableShutdownHooks();

  const port = parseInt(process.env.PORT || '5000', 10);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🚀 Server: http://localhost:${port} (env: ${process.env.NODE_ENV || 'development'})`);
}

void bootstrap();
