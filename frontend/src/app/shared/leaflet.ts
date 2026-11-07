import * as L from 'leaflet';

/** Default view: Adamawa State, Nigeria. */
export const DEFAULT_CENTER: L.LatLngExpression = [9.33, 12.4];
export const DEFAULT_ZOOM = 8;

export function createMap(el: HTMLElement): L.Map {
  const map = L.map(el, { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  });
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri',
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
