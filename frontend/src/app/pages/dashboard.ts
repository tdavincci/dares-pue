import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { environment } from '../../environments/environment';
import { DashboardSummary, Device } from '../core/models';
import { Notify } from '../core/notify';
import { AgoPipe, DistancePipe, GeofencePill } from '../shared/ui';

@Component({
  selector: 'app-dashboard',
  imports: [MatCardModule, MatIconModule, MatButtonModule, MatTableModule, RouterLink, DecimalPipe, CurrencyPipe, AgoPipe, DistancePipe, GeofencePill],
  template: `
    <div class="head">
      <h1>Dashboard</h1>
      <button mat-stroked-button (click)="load()"><mat-icon>refresh</mat-icon>Refresh</button>
    </div>

    @if (s(); as s) {
      <div class="stats">
        <a class="stat" routerLink="/devices"><mat-icon>water_pump</mat-icon>
          <div><div class="v">{{ s.devices.total | number }}</div><div class="k">Pumps registered</div>
          <div class="sub">{{ s.devices.active }} active · {{ s.devices.registered }} in stock</div></div></a>
        <a class="stat good" routerLink="/devices" [queryParams]="{ online: true }"><mat-icon>sensors</mat-icon>
          <div><div class="v">{{ s.devices.online | number }}</div><div class="k">Online now</div>
          <div class="sub">reported in last {{ s.onlineThresholdMinutes }} min</div></div></a>
        <a class="stat warn" routerLink="/devices" [queryParams]="{ online: false }"><mat-icon>sensors_off</mat-icon>
          <div><div class="v">{{ s.devices.offline | number }}</div><div class="k">Offline</div>
          <div class="sub">not decommissioned</div></div></a>
        <a class="stat bad" routerLink="/devices" [queryParams]="{ withinGeofence: false }"><mat-icon>wrong_location</mat-icon>
          <div><div class="v">{{ s.devices.outsideGeofence | number }}</div><div class="k">Outside intended farm</div>
          <div class="sub">last fix beyond geofence</div></div></a>
        <a class="stat" routerLink="/farmers"><mat-icon>agriculture</mat-icon>
          <div><div class="v">{{ s.farmers.total | number }}</div><div class="k">Farmers</div>
          <div class="sub">{{ s.devices.assigned }} pumps assigned</div></div></a>
        <a class="stat" routerLink="/payments"><mat-icon>payments</mat-icon>
          <div><div class="v">{{ s.payments.amount | currency: currency : 'symbol-narrow' : '1.0-0' }}</div><div class="k">Collected</div>
          <div class="sub">{{ s.payments.paidDevices }} paid · {{ s.payments.unpaidAssignedDevices }} assigned unpaid</div></div></a>
      </div>
    }

    <div class="grid">
      <mat-card appearance="outlined">
        <mat-card-header><mat-card-title>Pumps outside their farm</mat-card-title></mat-card-header>
        <mat-card-content>
          @if (outside().length) {
            <table mat-table [dataSource]="outside()">
              <ng-container matColumnDef="serial"><th mat-header-cell *matHeaderCellDef>Pump</th>
                <td mat-cell *matCellDef="let d"><a [routerLink]="['/devices', d.id]">{{ d.serialNumber }}</a></td></ng-container>
              <ng-container matColumnDef="farmer"><th mat-header-cell *matHeaderCellDef>Farmer</th>
                <td mat-cell *matCellDef="let d">{{ d.farmer?.fullName ?? '—' }}</td></ng-container>
              <ng-container matColumnDef="dist"><th mat-header-cell *matHeaderCellDef>Distance</th>
                <td mat-cell *matCellDef="let d">{{ d.lastDistanceFromFarmMeters | distance }}</td></ng-container>
              <ng-container matColumnDef="seen"><th mat-header-cell *matHeaderCellDef>Last seen</th>
                <td mat-cell *matCellDef="let d">{{ d.lastSeenAt | ago }}</td></ng-container>
              <tr mat-header-row *matHeaderRowDef="cols"></tr>
              <tr mat-row *matRowDef="let row; columns: cols"></tr>
            </table>
          } @else { <p class="empty"><mat-icon>check_circle</mat-icon> Every reporting pump is on its intended farm.</p> }
        </mat-card-content>
      </mat-card>

      <mat-card appearance="outlined">
        <mat-card-header><mat-card-title>Active pumps not reporting</mat-card-title></mat-card-header>
        <mat-card-content>
          @if (offline().length) {
            <table mat-table [dataSource]="offline()">
              <ng-container matColumnDef="serial"><th mat-header-cell *matHeaderCellDef>Pump</th>
                <td mat-cell *matCellDef="let d"><a [routerLink]="['/devices', d.id]">{{ d.serialNumber }}</a></td></ng-container>
              <ng-container matColumnDef="farmer"><th mat-header-cell *matHeaderCellDef>Farmer</th>
                <td mat-cell *matCellDef="let d">{{ d.farmer?.fullName ?? '—' }}</td></ng-container>
              <ng-container matColumnDef="dist"><th mat-header-cell *matHeaderCellDef>Geofence</th>
                <td mat-cell *matCellDef="let d"><app-geofence [within]="d.lastWithinGeofence" [distance]="d.lastDistanceFromFarmMeters" /></td></ng-container>
              <ng-container matColumnDef="seen"><th mat-header-cell *matHeaderCellDef>Last seen</th>
                <td mat-cell *matCellDef="let d">{{ d.lastSeenAt | ago }}</td></ng-container>
              <tr mat-header-row *matHeaderRowDef="cols"></tr>
              <tr mat-row *matRowDef="let row; columns: cols"></tr>
            </table>
          } @else { <p class="empty"><mat-icon>check_circle</mat-icon> All active pumps are reporting.</p> }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    h1 { font: var(--mat-sys-headline-small); margin: 0; }
    .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat { display: flex; gap: 14px; padding: 18px; border-radius: 16px; background: var(--mat-sys-surface-container-low); border: 1px solid var(--mat-sys-outline-variant); color: inherit; text-decoration: none; }
    .stat:hover { background: var(--mat-sys-surface-container); }
    .stat mat-icon { color: var(--mat-sys-primary); }
    .stat.good mat-icon { color: #1e8e3e; } .stat.warn mat-icon { color: #b06000; } .stat.bad mat-icon { color: #d93025; }
    .v { font: var(--mat-sys-headline-small); font-weight: 600; }
    .k { font: var(--mat-sys-label-large); }
    .sub { font: var(--mat-sys-body-small); color: var(--mat-sys-on-surface-variant); margin-top: 2px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 16px; }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
    table { width: 100%; }
    .empty { display: flex; gap: 8px; align-items: center; color: var(--mat-sys-on-surface-variant); padding: 16px 0; }
    .empty mat-icon { color: #1e8e3e; }
  `,
})
export class DashboardPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private notify = inject(Notify);
  s = signal<DashboardSummary | null>(null);
  outside = signal<Device[]>([]);
  offline = signal<Device[]>([]);
  cols = ['serial', 'farmer', 'dist', 'seen'];
  currency = environment.currency;
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit() {
    this.load();
    if (environment.refresh.dashboardMs > 0) this.timer = setInterval(() => this.load(), environment.refresh.dashboardMs);
  }
  ngOnDestroy() {
    clearInterval(this.timer);
  }

  load() {
    forkJoin({
      s: this.api.dashboard(),
      outside: this.api.devices({ withinGeofence: false, pageSize: 10 }),
      offline: this.api.devices({ status: 'ACTIVE', online: false, pageSize: 10 }),
    }).subscribe({
      next: (r) => {
        this.s.set(r.s);
        this.outside.set(r.outside.items.filter((d) => d.status !== 'DECOMMISSIONED'));
        this.offline.set(r.offline.items);
      },
      error: (e) => this.notify.error(e),
    });
  }
}
