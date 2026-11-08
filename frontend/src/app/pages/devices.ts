import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth';
import { Device, DEVICE_PAYMENT_STATUSES, DEVICE_STATUSES, UnregisteredTracker } from '../core/models';
import { DevicePatch, LiveService, patchDevice } from '../core/live.service';
import { Notify } from '../core/notify';
import { AgoPipe, DeviceStatusPill, GeofencePill, LabelPipe, OnlinePill, PaymentStatusPill, SecretDialog } from '../shared/ui';
import { DeviceFormDialog, DeviceFormData } from './device-form';

export function showIngestKey(dialog: MatDialog, serial: string, key: string) {
  dialog.open(SecretDialog, {
    width: '560px',
    data: {
      title: `Ingest key for ${serial}`,
      message:
        'Only needed for trackers that send positions over HTTP (JSON or OsmAnd/Traccar). GT06 car trackers authenticate by IMEI and do not use it. This key is shown once.',
      secrets: [{ label: 'X-Device-Key', value: key }],
    },
  });
}

@Component({
  selector: 'app-devices',
  imports: [
    FormsModule, MatTableModule, MatPaginatorModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressBarModule, MatTooltipModule,
    AgoPipe, LabelPipe, DecimalPipe, DeviceStatusPill, GeofencePill, OnlinePill, PaymentStatusPill,
  ],
  template: `
    <div class="head">
      <h1>Pumps & trackers</h1>
      @if (auth.canEdit()) {
        <button mat-flat-button (click)="openForm()"><mat-icon>add</mat-icon>Register pump</button>
      }
    </div>

    @if (unknown().length && auth.canEdit()) {
      <div class="banner">
        <mat-icon>contact_support</mat-icon>
        <div class="grow">
          <strong>{{ unknown().length }} unregistered tracker{{ unknown().length > 1 ? 's are' : ' is' }} trying to report.</strong>
          <div class="chips">
            @for (u of unknown(); track u.imei) {
              <button mat-stroked-button (click)="openForm({ imei: u.imei })" [matTooltip]="u.source + ' · ' + u.attempts + ' attempts · ' + (u.lastSeenAt | ago)">
                {{ u.imei }} <mat-icon iconPositionEnd>add</mat-icon>
              </button>
            }
          </div>
        </div>
      </div>
    }

    <div class="filters">
      <mat-form-field class="search"><mat-label>Search</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [(ngModel)]="search" (ngModelChange)="search$.next()" placeholder="Serial, IMEI, farmer, account" /></mat-form-field>
      <mat-form-field><mat-label>Status</mat-label>
        <mat-select [(ngModel)]="status" (ngModelChange)="reload()">
          <mat-option [value]="''">Any</mat-option>
          @for (s of statuses; track s) { <mat-option [value]="s">{{ s | label }}</mat-option> }
        </mat-select></mat-form-field>
      <mat-form-field><mat-label>Connectivity</mat-label>
        <mat-select [(ngModel)]="onlineF" (ngModelChange)="reload()">
          <mat-option value="">Any</mat-option><mat-option value="true">Online</mat-option><mat-option value="false">Offline</mat-option>
        </mat-select></mat-form-field>
      <mat-form-field><mat-label>Location</mat-label>
        <mat-select [(ngModel)]="geoF" (ngModelChange)="reload()">
          <mat-option value="">Any</mat-option><mat-option value="true">On farm</mat-option><mat-option value="false">Outside farm</mat-option>
        </mat-select></mat-form-field>
      <mat-form-field><mat-label>Payment</mat-label>
        <mat-select [(ngModel)]="payF" (ngModelChange)="reload()">
          <mat-option value="">Any</mat-option>
          @for (s of payStatuses; track s) { <mat-option [value]="s"><app-payment-status [status]="s" /></mat-option> }
        </mat-select></mat-form-field>
    </div>

    <div class="table-wrap">
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      <table mat-table [dataSource]="rows()">
        <ng-container matColumnDef="serial"><th mat-header-cell *matHeaderCellDef>Pump</th>
          <td mat-cell *matCellDef="let d"><div class="strong">{{ d.serialNumber }}</div><div class="muted">IMEI {{ d.trackerImei }}</div></td></ng-container>
        <ng-container matColumnDef="farmer"><th mat-header-cell *matHeaderCellDef>Farmer</th>
          <td mat-cell *matCellDef="let d">
            @if (d.farmer) { <div>{{ d.farmer.fullName }}</div><div class="muted">{{ d.farmer.accountNumber }}</div> } @else { <span class="muted">Unassigned</span> }
          </td></ng-container>
        <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>Status</th>
          <td mat-cell *matCellDef="let d"><app-device-status [status]="d.status" /></td></ng-container>
        <ng-container matColumnDef="payment"><th mat-header-cell *matHeaderCellDef>Payment</th>
          <td mat-cell *matCellDef="let d">
            <app-payment-status [status]="d.paymentStatus" />
            @if (d.paymentStatus === 'PARTIAL' || (d.paymentStatus === 'UNPAID' && d.price != null)) {
              <div class="muted">{{ d.amountPaid | number: '1.0-2' }} / {{ d.price | number: '1.0-2' }} {{ d.currency }}</div>
            } @else if (d.paymentStatus === 'PAID' && d.lastPaidAt) {
              <div class="muted">{{ d.lastPaidAt | ago }}</div>
            }
          </td></ng-container>
        <ng-container matColumnDef="online"><th mat-header-cell *matHeaderCellDef>Signal</th>
          <td mat-cell *matCellDef="let d"><app-online [online]="d.online" /><div class="muted">{{ d.lastSeenAt | ago }}</div></td></ng-container>
        <ng-container matColumnDef="geo"><th mat-header-cell *matHeaderCellDef>Location</th>
          <td mat-cell *matCellDef="let d"><app-geofence [within]="d.lastWithinGeofence" [distance]="d.lastDistanceFromFarmMeters" /></td></ng-container>
        <ng-container matColumnDef="coords"><th mat-header-cell *matHeaderCellDef>Last coordinates</th>
          <td mat-cell *matCellDef="let d" class="mono">
            @if (d.lastLatitude != null) { {{ d.lastLatitude.toFixed(6) }}, {{ d.lastLongitude.toFixed(6) }} } @else { — }
          </td></ng-container>
        <ng-container matColumnDef="battery"><th mat-header-cell *matHeaderCellDef>Battery</th>
          <td mat-cell *matCellDef="let d">{{ d.lastBatteryLevel != null ? d.lastBatteryLevel + '%' : '—' }}</td></ng-container>
        <tr mat-header-row *matHeaderRowDef="cols; sticky: true"></tr>
        <tr mat-row *matRowDef="let row; columns: cols" class="click" (click)="router.navigate(['/devices', row.id])"></tr>
        <tr class="mat-row" *matNoDataRow><td class="mat-cell empty" [attr.colspan]="cols.length">No pumps found.</td></tr>
      </table>
      <mat-paginator [length]="total()" [pageSize]="pageSize" [pageIndex]="page - 1" [pageSizeOptions]="[25, 50, 100]" (page)="onPage($event)" />
    </div>
  `,
  styles: `
    .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    h1 { font: var(--mat-sys-headline-small); margin: 0; }
    .banner { display: flex; gap: 12px; padding: 12px 16px; border-radius: 12px; background: #fff1d6; color: #5c3900; margin-bottom: 16px; }
    .grow { flex: 1; } .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .filters { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
    .search { flex: 1; min-width: 240px; }
    .table-wrap { border: 1px solid var(--mat-sys-outline-variant); border-radius: 16px; overflow: auto; }
    table { width: 100%; }
    .strong { font-weight: 500; } .muted { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
    .mono { font-family: ui-monospace, monospace; font-size: 12px; }
    .click { cursor: pointer; } .click:hover { background: var(--mat-sys-surface-container-low); }
    .empty { padding: 24px; text-align: center; color: var(--mat-sys-on-surface-variant); }
  `,
})
export class DevicesPage implements OnInit {
  // query params (component input binding)
  online = input<string>();
  withinGeofence = input<string>();
  paymentStatus = input<string>();

  auth = inject(AuthService);
  router = inject(Router);
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private notify = inject(Notify);
  private live = inject(LiveService);
  private destroyRef = inject(DestroyRef);
  private refresh$ = new Subject<void>();
  private refreshUnknown$ = new Subject<void>();

  statuses = DEVICE_STATUSES;
  cols = ['serial', 'farmer', 'status', 'payment', 'online', 'geo', 'coords', 'battery'];
  rows = signal<Device[]>([]);
  total = signal(0);
  loading = signal(false);
  unknown = signal<UnregisteredTracker[]>([]);
  search = '';
  status = '';
  onlineF = '';
  geoF = '';
  payF = '';
  payStatuses = DEVICE_PAYMENT_STATUSES;
  page = 1;
  pageSize = 25;
  search$ = new Subject<void>();

  ngOnInit() {
    this.onlineF = this.online() ?? '';
    this.geoF = this.withinGeofence() ?? '';
    this.payF = this.paymentStatus() ?? '';
    this.search$.pipe(debounceTime(300)).subscribe(() => this.reload());
    this.reload();
    if (this.auth.canEdit()) this.api.unregistered().subscribe((u) => this.unknown.set(u));

    // Live updates: patch visible rows in place; refetch the current page only when rows were added,
    // removed or no longer match the active filters.
    this.refresh$.pipe(debounceTime(1000), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
    this.refreshUnknown$
      .pipe(debounceTime(1000), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.api.unregistered().subscribe((u) => this.unknown.set(u)));
    this.live
      .stream(['devices'])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((m) => {
        if (m.type === 'device.live') this.applyPatch(m.data as DevicePatch);
        else if (m.type === 'tracker.unregistered') {
          if (this.auth.canEdit()) this.refreshUnknown$.next();
        } else {
          this.refresh$.next(); // device.changed, farmer.changed, payment.changed, resync
          if (m.type === 'resync' && this.auth.canEdit()) this.refreshUnknown$.next();
        }
      });
  }

  private applyPatch(p: DevicePatch) {
    const rows = this.rows();
    const i = rows.findIndex((d) => d.id === p.id);
    if (i < 0) return; // not on this page
    const next = patchDevice(rows[i], p);
    this.rows.set(rows.map((d, j) => (j === i ? next : d)));
    const leftOnlineFilter = this.onlineF !== '' && String(next.online) !== this.onlineF;
    const leftGeoFilter = this.geoF !== '' && String(next.lastWithinGeofence) !== this.geoF;
    if (leftOnlineFilter || leftGeoFilter) this.refresh$.next();
  }

  reload() {
    this.page = 1;
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api
      .devices({ search: this.search, status: this.status, online: this.onlineF, withinGeofence: this.geoF, paymentStatus: this.payF, page: this.page, pageSize: this.pageSize })
      .subscribe({
        next: (r) => {
          this.rows.set(r.items);
          this.total.set(r.total);
          this.loading.set(false);
        },
        error: (e) => {
          this.notify.error(e);
          this.loading.set(false);
        },
      });
  }

  onPage(e: PageEvent) {
    this.page = e.pageIndex + 1;
    this.pageSize = e.pageSize;
    this.load();
  }

  openForm(data: DeviceFormData = {}) {
    this.dialog
      .open(DeviceFormDialog, { width: '760px', maxWidth: '96vw', data })
      .afterClosed()
      .subscribe((res?: { device: Device; ingestKey: string }) => {
        if (!res) return;
        this.notify.ok(`Pump ${res.device.serialNumber} registered`);
        showIngestKey(this.dialog, res.device.serialNumber, res.ingestKey);
        this.unknown.update((u) => u.filter((x) => x.imei !== res.device.trackerImei));
        this.reload();
      });
  }
}
