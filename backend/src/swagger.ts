import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiClientsModule } from './api-clients/api-clients.module';
import { AppModule } from './app.module';
import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './devices/devices.module';
import { FarmersModule } from './farmers/farmers.module';
import { IngestModule } from './ingest/ingest.module';
import { ODYSSEY_BEARER } from './odyssey/odyssey.controller';
import { OdysseyModule } from './odyssey/odyssey.module';
import { PaymentsModule } from './payments/payments.module';

/**
 * Two Swagger documents:
 *  1. Odyssey Standard API — mirrors https://qa-standard-api.odyssey.energy/api/v1/odyssey/standard/swagger-ui
 *     served at the same relative path: /api/v1/odyssey/standard/swagger-ui (+ JSON at /api/v1/odyssey/standard/api-docs)
 *  2. Full admin + ingest API at /api/docs
 */
export function setupSwagger(app: INestApplication) {
  const odysseyConfig = new DocumentBuilder()
    .setTitle('DARES PUE Standard API')
    .setDescription(
      'Odyssey Standard API implementation for the DARES PUE solar water-pump tracking programme.\n\n' +
        'Each water pump is fitted with a GPS tracker. Pumps are exposed as **meters** (`meterId` = pump serial number) ' +
        'and each tracker position fix is exposed as a **reading** carrying `latitude`/`longitude`. Pump payments are ' +
        'exposed through the standard payments endpoint.\n\n' +
        'Authentication: `Authorization: Bearer <token>`. Tokens are issued by the DARES PUE administrator, or obtained ' +
        'with a refresh token from `POST /api/v1/odyssey/standard/token-renewal`.\n\n' +
        'All timestamps are ISO 8601 UTC.',
    )
    .setVersion('1.0.0')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer('/', 'Current Server')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'opaque',
        description: 'Bearer authentication token issued by DARES PUE',
      },
      ODYSSEY_BEARER,
    )
    .build();
  const odysseyDoc = SwaggerModule.createDocument(app, odysseyConfig, { include: [OdysseyModule] });
  SwaggerModule.setup('api/v1/odyssey/standard/swagger-ui', app, odysseyDoc, {
    jsonDocumentUrl: 'api/v1/odyssey/standard/api-docs',
    customSiteTitle: 'DARES PUE · Odyssey Standard API',
    swaggerOptions: { operationsSorter: 'method', defaultModelsExpandDepth: -1, persistAuthorization: true },
  });

  const adminConfig = new DocumentBuilder()
    .setTitle('DARES PUE Tracking — Admin & Ingest API')
    .setDescription(
      'Administration API used by the Angular admin portal (farmers, pumps/devices, payments, map, API clients) ' +
        'and the HTTP tracker ingest endpoints. Log in with `POST /api/v1/auth/login` and use the returned JWT.\n\n' +
        'GT06-family car trackers connect over TCP to the GT06 port (default 5023) and are not listed here.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'admin-jwt')
    .build();
  const adminDoc = SwaggerModule.createDocument(app, adminConfig, {
    include: [AppModule, AuthModule, FarmersModule, DevicesModule, PaymentsModule, ApiClientsModule, IngestModule],
  });
  SwaggerModule.setup('api/docs', app, adminDoc, {
    jsonDocumentUrl: 'api/docs-json',
    customSiteTitle: 'DARES PUE · Admin API',
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
  });
}
