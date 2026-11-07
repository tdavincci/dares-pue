import { CurrencyPipe, DatePipe } from '@angular/common';
import { AfterViewInit, Component, ElementRef, inject, input, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth';
import { Device, LocationPoint, Payment } from '../core/models';
import { Notify } from '../core/notify';
import { COLORS, createMap, deviceColor } from '../shared/leaflet';
import { AgoPipe, ConfirmDialog, DeviceStatusPill, DistancePipe, GeofencePill, LabelPipe, OnlinePill, Pill } from '../shared/ui';
import { DeviceFormDialog } from './device-form';
import { showIngestKey } from './devices';
import { PaymentFormDialog } from './payments';

@Component({
  selector: 'app-device-detail',
  imports: [
    FormsModule, RouterLink, DatePipe, CurrencyPipe, MatCardModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatTableModule,
    AgoPipe, DistancePipe, LabelPipe, DeviceStatusPill, GeofencePill, OnlinePill, Pill,
  ],
  template: `
    @if (d(); as d) {
      <div class="head">
        <div>
          <a routerLink="/devices" class="back"><mat-icon>arrow_back</mat-icon> Pumps</a>
          <h1>{{ d.serialNumber }}</h1>
          <div class="pills"><app-device-status [status]="d.status" /><app-online [online]="d.online" />
            <app-geofence [within]="d.lastWithinGeofence" [distance]="d.lastDistanceFromFarmMeters" />
            @if (payment()) { <app-pill text="Paid in full" tone="good" /> } @else if (d.farmer) { <app-pill text="Unpaid" tone="warn" /> }
          </div>
        </div>
        @if (auth.canEdit()) {
          <div class="actions">
            @if (!payment() && d.farmer) {
              <button mat-flat-button (click)="recordPayment()"><mat-icon>payments</mat-icon>Record payment</button>
            }
            <button mat-stroked-button (click)="edit()"><mat-icon>edit</mat-icon>Edit</button>
            @if (auth.isAdmin()) {
              <button mat-stroked-button (click)="rotate()"><mat-icon>key</mat-icon>New ingest key</button>
            }
          </div>
        }
      </div>

      <div class="grid">
        <mat-card appearance="outlined">
          <mat-card-header><mat-card-title>Details</mat-card-title></mat-card-header>
          <mat-card-content>
            <dl>
              <dt>Tracker IMEI</dt><dd class="mono">{{ d.trackerImei }}</dd>
              <dt>Tracker</dt><dd>{{ d.trackerModel }} {{ d.trackerSimNumber ? '· SIM ' + d.trackerSimNumber : '' }}</dd>
              <dt>Pump</dt><dd>{{ d.pumpModel ?? '—' }} {{ d.pumpCapacity ? '· ' + d.pumpCapacity : '' }}</dd>
              <dt>Price</dt><dd>{{ d.price != null ? (d.price | currency: d.currency : 'symbol-narrow') : '—' }}</dd>
              <dt>Farmer</dt><dd>
                @if (d.farmer) { <a [routerLink]="['/farmers', d.farmer.id]">{{ d.farmer.fullName }}</a> · {{ d.farmer.accountNumber }} · {{ d.farmer.phone }} }
                @else { Unassigned }</dd>
              <dt>Farm point</dt><dd class="mono">
                @if (d.farmer?.farmLatitude != null) { {{ d.farmer!.farmLatitude!.toFixed(6) }}, {{ d.farmer!.farmLongitude!.toFixed(6) }} (±{{ d.geofenceRadiusMeters }} m) } @else { not set }</dd>
              <dt>Last position</dt><dd class="mono">
                @if (d.lastLatitude != null) { {{ d.lastLatitude.toFixed(6) }}, {{ d.lastLongitude!.toFixed(6) }} } @else { — }</dd>
              <dt>Distance from farm</dt><dd>{{ d.lastDistanceFromFarmMeters | distance }}</dd>
              <dt>Last fix</dt><dd>{{ d.lastFixAt ? (d.lastFixAt | date: 'medium') : '—' }}</dd>
              <dt>Last seen</dt><dd>{{ d.lastSeenAt | ago }}</dd>
              <dt>Battery</dt><dd>{{ d.lastBatteryLevel != null ? d.lastBatteryLevel + '%' : '—' }}</dd>
              <dt>Installed</dt><dd>{{ d.installedAt ? (d.installedAt | date: 'mediumDate') : '—' }}</dd>
              @if (payment(); as p) {
                <dt>Payment</dt><dd>{{ p.amount | currency: p.currency : 'symbol-narrow' }} · {{ p.method | label }} · {{ p.paidAt | date: 'mediumDate' }}<br /><span class="mono">{{ p.transactionId }}</span></dd>
              }
            </dl>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined" class="map-card">
          <mat-card-header>
            <mat-card-title>Track</mat-card-title>
            <span class="spacer"></span>
            <mat-button-toggle-group [ngModel]="hours()" (ngModelChange)="hours.set($event); loadHistory()" hideSingleSelectionIndicator>
              <mat-button-toggle [value]="6">6 h</mat-button-toggle>
              <mat-button-toggle [value]="24">24 h</mat-button-toggle>
              <mat-button-toggle [value]="168">7 d</mat-button-toggle>
              <mat-button-toggle [value]="720">30 d</mat-button-toggle>
            </mat-button-toggle-group>
          </mat-card-header>
          <mat-card-content><div #mapEl class="map"></div></mat-card-content>
        </mat-card>
      </div>

      <mat-card appearance="outlined" class="history">
        <mat-card-header><mat-card-title>Position history ({{ points().length }})</mat-card-title></mat-card-header>
        <mat-card-content class="scroll">
          <table mat-table [dataSource]="pointsDesc()">
            <ng-container matColumnDef="time"><th mat-header-cell *matHeaderCellDef>Fix time</th>
              <td mat-cell *matCellDef="let p">{{ p.recordedAt | date: 'medium' }}</td></ng-container>
            <ng-container matColumnDef="coords"><th mat-header-cell *matHeaderCellDef>Coordinates</th>
              <td mat-cell *matCellDef="let p" class="mono">{{ p.latitude.toFixed(6) }}, {{ p.longitude.toFixed(6) }}</td></ng-container>
            <ng-container matColumnDef="geo"><th mat-header-cell *matHeaderCellDef>Farm</th>
              <td mat-cell *matCellDef="let p"><app-geofence [within]="p.withinGeofence" [distance]="p.distanceFromFarmMeters" /></td></ng-container>
            <ng-container matColumnDef="speed"><th mat-header-cell *matHeaderCellDef>Speed</th>
              <td mat-cell *matCellDef="let p">{{ p.speedKph != null ? p.speedKph + ' km/h' : '—' }}</td></ng-container>
            <ng-container matColumnDef="battery"><th mat-header-cell *matHeaderCellDef>Battery</th>
              <td mat-cell *matCellDef="let p">{{ p.batteryLevel != null ? p.batteryLevel + '%' : '—' }}</td></ng-container>
            <ng-container matColumnDef="source"><th mat-header-cell *matHeaderCellDef>Source</th>
              <td mat-cell *matCellDef="let p">{{ p.source }}</td></ng-container>
            <tr mat-header-row *matHeaderRowDef="cols; sticky: true"></tr>
            <tr mat-row *matRowDef="let row; columns: cols"></tr>
            <tr class="mat-row" *matNoDataRow><td class="mat-cell empty" [attr.colspan]="cols.length">No positions in this period.</td></tr>
          </table>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    .head { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; justify-content: space-between; margin-bottom: 16px; }
    .back { display: inline-flex; align-items: center; gap: 4px; color: var(--mat-sys-on-surface-variant); text-decoration: none; font: var(--mat-sys-label-large); }
    h1 { font: var(--mat-sys-headline-small); margin: 6px 0; }
    .pills { display: flex; gap: 6px; flex-wrap: wrap; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .grid { display: grid; grid-template-columns: 380px 1fr; gap: 16px; }
    @media (max-width: 959px) { .grid { grid-template-columns: 1fr; } }
    dl { display: grid; grid-template-columns: 130px 1fr; gap: 8px 12px; margin: 8px 0 0; }
    dt { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-label-medium); }
    dd { margin: 0; overflow-wrap: anywhere; }
    .mono { font-family: ui-monospace, monospace; font-size: 12px; }
    .map-card mat-card-header { display: flex; align-items: center; }
    .spacer { flex: 1; }
    .map { height: 440px; border-radius: 12px; margin-top: 8px; z-index: 0; }
    .history { margin-top: 16px; }
    .scroll { max-height: 420px; overflow: auto; }
    table { width: 100%; }
    .empty { padding: 24px; text-align: center; color: var(--mat-sys-on-surface-variant); }
  `,
})
export class DeviceDetailPage implements AfterViewInit, OnDestroy {
  id = input.required<string>();
  auth = inject(AuthService);
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private notify = inject(Notify);
  mapEl = viewChild<ElementRef<HTMLDivElement>>('mapEl');

  d = signal<Device | null>(null);
  payment = signal<Payment | null>(null);
  points = signal<LocationPoint[]>([]);
  pointsDesc = signal<LocationPoint[]>([]);
  hours = signal(24);
  cols = ['time', 'coords', 'geo', 'speed', 'battery', 'source'];
  private map?: L.Map;
  private layer = L.layerGroup();

  ngAfterViewInit() {
    this.load();
  }

  ngOnDestroy() {
    this.map?.remove();
  }

  load() {
    this.api.device(this.id()).subscribe({
      next: (d) => {
        this.d.set(d);
        setTimeout(() => this.initMap());
        this.loadHistory();
      },
      error: (e) => this.notify.error(e),
    });
    this.api.payments({ deviceId: this.id(), status: 'COMPLETED', pageSize: 1 }).subscribe((r) => this.payment.set(r.items[0] ?? null));
  }

  private initMap() {
    const el = this.mapEl()?.nativeElement;
    if (!el || this.map) return;
    this.map = createMap(el);
    this.layer.addTo(this.map);
    this.draw();
  }

  loadHistory() {
    const from = new Date(Date.now() - this.hours() * 3600_000).toISOString();
    this.api.deviceHistory(this.id(), { from, limit: 20000 }).subscribe({
      next: (r) => {
        this.points.set(r.points);
        this.pointsDesc.set([...r.points].reverse());
        this.draw();
      },
      error: (e) => this.notify.error(e),
    });
  }

  private draw() {
    const d = this.d();
    if (!this.map || !d) return;
    this.layer.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    const f = d.farmer;
    if (f?.farmLatitude != null && f.farmLongitude != null) {
      L.circle([f.farmLatitude, f.farmLongitude], { radius: d.geofenceRadiusMeters, color: COLORS.farm, dashArray: '6 6', fillOpacity: 0.1 })
        .bindTooltip(`Farm geofence (${d.geofenceRadiusMeters} m)`)
        .addTo(this.layer);
      bounds.push([f.farmLatitude, f.farmLongitude]);
    }
    const pts = this.points().map((p) => [p.latitude, p.longitude] as L.LatLngTuple);
    if (pts.length > 1) L.polyline(pts, { color: '#1a73e8', weight: 3, opacity: 0.7 }).addTo(this.layer);
    for (const p of this.points()) {
      if (p.withinGeofence === false)
        L.circleMarker([p.latitude, p.longitude], { radius: 4, color: COLORS.outside, fillOpacity: 0.8, weight: 1 })
          .bindTooltip(new Date(p.recordedAt).toLocaleString())
          .addTo(this.layer);
    }
    bounds.push(...pts);
    if (d.lastLatitude != null && d.lastLongitude != null) {
      L.circleMarker([d.lastLatitude, d.lastLongitude], { radius: 10, color: '#fff', weight: 2, fillColor: deviceColor({ online: d.online, withinGeofence: d.lastWithinGeofence }), fillOpacity: 1 })
        .bindTooltip('Last known position')
        .addTo(this.layer);
      bounds.push([d.lastLatitude, d.lastLongitude]);
    }
    if (bounds.length) this.map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 16 });
  }

  edit() {
    this.dialog
      .open(DeviceFormDialog, { width: '760px', maxWidth: '96vw', data: { device: this.d()! } })
      .afterClosed()
      .subscribe((res?: Device) => {
        if (!res) return;
        this.notify.ok('Pump updated');
        this.d.set(res);
        this.draw();
      });
  }

  rotate() {
    this.dialog
      .open(ConfirmDialog, {
        data: { title: 'Issue a new ingest key?', message: 'HTTP/OsmAnd trackers using the old key will stop reporting until reconfigured. GT06 trackers are not affected.', confirm: 'Issue key' },
      })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.api.rotateIngestKey(this.id()).subscribe({
          next: (r) => showIngestKey(this.dialog, this.d()!.serialNumber, r.ingestKey),
          error: (e) => this.notify.error(e),
        });
      });
  }

  recordPayment() {
    this.dialog
      .open(PaymentFormDialog, { width: '520px', maxWidth: '96vw', data: { device: this.d()! } })
      .afterClosed()
      .subscribe((p?: Payment) => {
        if (!p) return;
        this.notify.ok(`Payment ${p.transactionId} recorded`);
        this.payment.set(p);
      });
  }
}
