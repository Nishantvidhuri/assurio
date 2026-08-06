import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  // Disable Nest's default body parser so we can raise the limit —
  // candidates upload PAN card images as base64 data URLs.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // Trust one hop of reverse proxy (nginx / Cloudflare) so ThrottlerGuard
  // sees the real client IP via X-Forwarded-For, not the proxy's IP.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.use(cookieParser());

  const allowedOrigins = (process.env.CLIENT_APP_URLS || process.env.APP_URL || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    // `ngrok-skip-browser-warning` lets browser fetches bypass ngrok's free-tier
    // interstitial; it must be allow-listed here or the CORS preflight blocks it.
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'ngrok-skip-browser-warning'],
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
}
bootstrap();
