import * as L from 'leaflet';
import { environment } from '../../environments/environment';

/** Default view, from src/environments (Adamawa State, Nigeria by default). */
export const DEFAULT_CENTER: L.LatLngExpression = environment.map.defaultCenter;
export const DEFAULT_ZOOM = environment.map.defaultZoom;

export function createMap(el: HTMLElement): L.Map {
  const map = L.map(el, { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  const osm = L.tileLayer(environment.map.streetTilesUrl, {
    maxZoom: 19,
    attribution: environment.map.streetAttribution,
  });
  const sat = L.tileLayer(environment.map.satelliteTilesUrl, {
    maxZoom: 19,
    attribution: environment.map.satelliteAttribution,
  });
  osm.addTo(map);
  L.control.layers({ Map: osm, Satellite: sat }, undefined, { position: 'topright' }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  return map;
}

export const COLORS = {
  ok: '#1e8e3e',
  outside: '#d93025',
  offline: '#9aa0a6',
  unknown: '#1a73e8',
  farm: '#f9ab00',
};

export function deviceColor(d: { online: boolean; withinGeofence: boolean | null }) {
  if (d.withinGeofence === false) return COLORS.outside;
  if (!d.online) return COLORS.offline;
  if (d.withinGeofence === true) return COLORS.ok;
  return COLORS.unknown;
}

export function escapeHtml(s: string | null | undefined) {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
