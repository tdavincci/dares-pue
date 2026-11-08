/** Shape shared by every environment file, so a missing setting is a compile error. */
export interface AppEnvironment {
  /** true for production builds (`ng build`), false for `ng serve`. */
  production: boolean;

  /** Label shown on the login page / toolbar (e.g. add "(DEV)" in development). */
  appName: string;

  /**
   * Origin of the NestJS backend, with no trailing slash, e.g. `https://api.dares-pue.org`.
   * Leave it empty ('') when the portal and the API are served from the same domain
   * (Docker/nginx setup, or `ng serve` with proxy.conf.json).
   * When the API is on a different origin, add the portal URL to the backend's CORS_ORIGINS.
   */
  apiUrl: string;

  /** Path prefix of the backend REST API (matches app.setGlobalPrefix in backend/src/main.ts). */
  apiPrefix: string;

  /** Currency code used to format amounts that don't carry their own currency. */
  currency: string;

  /** Default pump geofence radius pre-filled when registering a pump (metres). */
  defaultGeofenceRadiusMeters: number;

  /** Auto-refresh intervals in milliseconds (0 = off). */
  refresh: {
    dashboardMs: number;
    mapMs: number;
  };

  map: {
    /** Initial map centre [latitude, longitude]. */
    defaultCenter: [number, number];
    defaultZoom: number;
    streetTilesUrl: string;
    streetAttribution: string;
    satelliteTilesUrl: string;
    satelliteAttribution: string;
  };
}
