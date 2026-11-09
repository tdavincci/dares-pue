import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import {
  ApiAccessLog,
  ApiClient,
  DashboardSummary,
  Device,
  Farmer,
  LocationPoint,
  MapDevice,
  Paged,
  Payment,
  UnregisteredTracker,
  User,
} from './models';

/** Backend origin ('' = same origin as the portal). Set in src/environments. */
export const API_ORIGIN = environment.apiUrl.replace(/\/+$/, '');
export const API_BASE = `${API_ORIGIN}${environment.apiPrefix}`;

type Query = Record<string, string | number | boolean | null | undefined>;

function params(q: Query = {}) {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  return p;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private url = (path: string) => `${API_BASE}${path}`;

  // dashboard
  dashboard() {
    return this.http.get<DashboardSummary>(this.url('/admin/dashboard'));
  }

  // farmers
  farmers(q: Query) {
    return this.http.get<Paged<Farmer>>(this.url('/admin/farmers'), { params: params(q) });
  }
  farmer(id: string) {
    return this.http.get<Farmer>(this.url(`/admin/farmers/${id}`));
  }
  createFarmer(body: Partial<Farmer>) {
    return this.http.post<Farmer>(this.url('/admin/farmers'), body);
  }
  updateFarmer(id: string, body: Partial<Farmer>) {
    return this.http.patch<Farmer>(this.url(`/admin/farmers/${id}`), body);
  }
  deleteFarmer(id: string) {
    return this.http.delete<void>(this.url(`/admin/farmers/${id}`));
  }

  // devices
  devices(q: Query) {
    return this.http.get<Paged<Device>>(this.url('/admin/devices'), { params: params(q) });
  }
  device(id: string) {
    return this.http.get<Device>(this.url(`/admin/devices/${id}`));
  }
  deviceMap() {
    return this.http.get<MapDevice[]>(this.url('/admin/devices/map'));
  }
  unregistered() {
    return this.http.get<UnregisteredTracker[]>(this.url('/admin/devices/unregistered'));
  }
  deviceHistory(id: string, q: Query) {
    return this.http.get<{ from: string; to: string; count: number; points: LocationPoint[] }>(
      this.url(`/admin/devices/${id}/locations`),
      { params: params(q) },
    );
  }
  createDevice(body: Record<string, unknown>) {
    return this.http.post<{ device: Device; ingestKey: string }>(this.url('/admin/devices'), body);
  }
  updateDevice(id: string, body: Record<string, unknown>) {
    return this.http.patch<Device>(this.url(`/admin/devices/${id}`), body);
  }
  rotateIngestKey(id: string) {
    return this.http.post<{ ingestKey: string }>(this.url(`/admin/devices/${id}/rotate-ingest-key`), {});
  }

  // payments
  payments(q: Query) {
    return this.http.get<Paged<Payment>>(this.url('/admin/payments'), { params: params(q) });
  }
  createPayment(body: Record<string, unknown>) {
    return this.http.post<Payment>(this.url('/admin/payments'), body);
  }
  reversePayment(id: string, reason: string) {
    return this.http.post<Payment>(this.url(`/admin/payments/${id}/reverse`), { reason });
  }

  // api clients
  apiClients() {
    return this.http.get<ApiClient[]>(this.url('/admin/api-clients'));
  }
  createApiClient(body: { name: string; description?: string }) {
    return this.http.post<ApiClient>(this.url('/admin/api-clients'), body);
  }
  updateApiClient(id: string, body: Partial<ApiClient>) {
    return this.http.patch<ApiClient>(this.url(`/admin/api-clients/${id}`), body);
  }
  issueToken(id: string, body: { label?: string; expiresInDays?: number }) {
    return this.http.post<{ token: string; tokenId: string; expiresAt: string | null }>(
      this.url(`/admin/api-clients/${id}/tokens`),
      body,
    );
  }
  revokeToken(id: string, tokenId: string) {
    return this.http.delete<void>(this.url(`/admin/api-clients/${id}/tokens/${tokenId}`));
  }
  apiAccessLog(q: Query) {
    return this.http.get<Paged<ApiAccessLog>>(this.url('/admin/api-clients/access-log'), { params: params(q) });
  }
  issueRefreshToken(id: string) {
    return this.http.post<{ refreshToken: string }>(this.url(`/admin/api-clients/${id}/refresh-token`), {});
  }

  // users
  users() {
    return this.http.get<User[]>(this.url('/admin/users'));
  }
  createUser(body: Record<string, unknown>) {
    return this.http.post<User>(this.url('/admin/users'), body);
  }
  updateUser(id: string, body: Record<string, unknown>) {
    return this.http.patch<User>(this.url(`/admin/users/${id}`), body);
  }
  changePassword(currentPassword: string, newPassword: string) {
    return this.http.post<void>(this.url('/auth/change-password'), { currentPassword, newPassword });
  }
}
