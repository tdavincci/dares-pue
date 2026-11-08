import { AppEnvironment } from './environment.model';

/** Settings shared by every environment. Override per environment in environment(.development).ts. */
export const baseEnvironment: Omit<AppEnvironment, 'production' | 'appName' | 'apiUrl'> = {
  apiPrefix: '/api/v1',

  currency: 'NGN',
  defaultGeofenceRadiusMeters: 500,

  refresh: {
    dashboardMs: 60_000,
    mapMs: 30_000,
  },

  map: {
    defaultCenter: [9.33, 12.4], // Adamawa State, Nigeria
    defaultZoom: 8,
    streetTilesUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    streetAttribution: '&copy; OpenStreetMap contributors',
    satelliteTilesUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    satelliteAttribution: 'Tiles &copy; Esri',
  },
};
