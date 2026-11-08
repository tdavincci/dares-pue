import { baseEnvironment } from './environment.base';
import { AppEnvironment } from './environment.model';

/**
 * DEVELOPMENT settings, used by `ng serve` / `npm start` (and `ng build --configuration development`).
 * Shared defaults live in environment.base.ts; override any of them here.
 */
export const environment: AppEnvironment = {
  ...baseEnvironment,
  production: false,
  appName: 'DARES PUE (DEV)',

  // Local NestJS backend. Its CORS_ORIGINS must include http://localhost:4200 (the default).
  // Set to '' to go through proxy.conf.json instead.
  apiUrl: 'http://localhost:3000',
};
