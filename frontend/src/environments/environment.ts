import { baseEnvironment } from './environment.base';
import { AppEnvironment } from './environment.model';

/**
 * PRODUCTION settings, used by `ng build` / `npm run build` and the Docker image.
 * For `ng serve`, angular.json swaps this file for environment.development.ts.
 * Shared defaults (currency, map, refresh intervals…) live in environment.base.ts.
 */
export const environment: AppEnvironment = {
  ...baseEnvironment,
  production: true,
  appName: 'DARES PUE',

  // '' = same domain as the portal (nginx in frontend/nginx.conf forwards /api to the backend).
  // If the API is hosted separately, set its URL here, e.g. 'https://api.dares-pue.org',
  // and add the portal's URL to the backend's CORS_ORIGINS.
  apiUrl: 'https://dares-pue-production.up.railway.app',
};
