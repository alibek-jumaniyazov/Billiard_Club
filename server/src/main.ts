import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Fikr-mulohaza ilovalari base64 rasm yuboradi (3 x 500KB) — standart
  // 100kb JSON limiti yetmaydi
  app.useBodyParser('json', { limit: '5mb' });

  // Reverse proxy (nginx/Caddy) ortida to'g'ri IP aniqlash — rate limit uchun muhim.
  // Faqat TRUST_PROXY=true bo'lganda yoqiladi: aks holda istalgan klient
  // X-Forwarded-For yuborib IP limitini aylanib o'tishi mumkin edi.
  if (config.get<boolean>('TRUST_PROXY')) {
    app.set('trust proxy', 1);
  }

  app.use(helmet());
  // httpOnly 'refresh_token' cookie ni o'qish uchun (auth refresh oqimi)
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  app.setGlobalPrefix('api', { exclude: ['health'] });

  // DIQQAT: uploads papkasi ATAYLAB statik tarqatilmaydi — fikr-mulohaza
  // rasmlari autentifikatsiyalangan /feedback/:id/attachments/:index va
  // /admin/feedback/:id/attachments/:index endpointlari orqali beriladi
  // (tenant izolyatsiyasi: har klub faqat o'z rasmlarini ko'radi).

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTOda yo'q maydonlar olib tashlanadi (mass-assignment himoyasi)
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Xotirjam o'chirish: ulanishlar yopilib, DB pool bo'shatiladi
  app.enableShutdownHooks();

  // Xavfsizlik pozitsiyasi NODE_ENV ga bog'liq (fail-loud): production
  // bo'lmasa refresh cookie Secure EMAS va DB SSL o'chiq — internetga chiqqan
  // deploy'da bu xavfli. Operator buni darhol ko'rishi uchun baland ogohlantirish.
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      '⚠️  NODE_ENV != "production": refresh cookie Secure EMAS va DB SSL o\'chiq. ' +
        'Internetga chiqqan har qanday deploy uchun NODE_ENV=production qo\'ying.',
    );
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🚀 Server: http://localhost:${port} (env: ${process.env.NODE_ENV || 'development'})`);
}

void bootstrap();
