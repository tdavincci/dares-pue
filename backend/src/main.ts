import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { setupSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  const corsOrigins = config.get<string[]>('corsOrigins')!;
  // '*' reflects whichever site is calling; otherwise only the listed sites may call from a browser.
  app.enableCors({ origin: corsOrigins.includes('*') ? true : corsOrigins, credentials: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false }));
  app.enableShutdownHooks();

  setupSwagger(app);

  const port = config.get<number>('port')!;
  await app.listen(port, '0.0.0.0');
  const log = new Logger('Bootstrap');
  log.log(`HTTP API on http://localhost:${port}/api/v1`);
  log.log(`CORS allowed origins:  ${corsOrigins.includes('*') ? 'any (*)' : corsOrigins.join(', ') || '(none)'}`);
  log.log(`Admin API docs:        http://localhost:${port}/api/docs`);
  log.log(`Odyssey Standard docs: http://localhost:${port}/api/v1/odyssey/standard/swagger-ui`);
}
void bootstrap();
