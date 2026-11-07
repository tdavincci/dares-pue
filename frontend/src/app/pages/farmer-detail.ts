import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth';
import { Device, Farmer, Payment } from '../core/models';
import { Notify } from '../core/notify';
import { AgoPipe, ConfirmDialog, DeviceStatusPill, GeofencePill, JoinPipe, LabelPipe, Pill } from '../shared/ui';
import { DeviceFormDialog } from './device-form';
import { showIngestKey } from './devices';
import { FarmerFormDialog } from './farmer-form';

@Component({
  selector: 'app-farmer-detail',
  imports: [RouterLink, DatePipe, CurrencyPipe, MatCardModule, MatButtonModule, MatIconModule, MatTableModule, AgoPipe, LabelPipe, Pill, DeviceStatusPill, GeofencePill, JoinPipe],
  template: `
    @if (f(); as f) {
      <div class="head">
        <div>
          <a routerLink="/farmers" class="back"><mat-icon>arrow_back</mat-icon> Farmers</a>
          <h1>{{ f.fullName }}</h1>
          <div class="muted">{{ f.accountNumber }} · {{ f.phone }}</div>
        </div>
        @if (auth.canEdit()) {
          <div class="actions">
            <button mat-flat-button (click)="assignPump()"><mat-icon>add</mat-icon>Register pump for farmer</button>
            <button mat-stroked-button (click)="edit()"><mat-icon>edit</mat-icon>Edit</button>
            @if (auth.isAdmin()) { <button mat-stroked-button (click)="remove()"><mat-icon>delete</mat-icon>Delete</button> }
          </div>
        }
      </div>
      <div class="grid">
        <mat-card appearance="outlined">
          <mat-card-header><mat-card-title>Profile</mat-card-title></mat-card-header>
          <mat-card-content>
            <dl>
              <dt>Email</dt><dd>{{ f.email ?? '—' }}</dd>
              <dt>Location</dt><dd>{{ [f.address, f.community, f.lga, f.state] | join }}</dd>
              <dt>Farm</dt><dd>{{ f.farmName ?? '—' }} {{ f.farmSizeHectares ? '· ' + f.farmSizeHectares + ' ha' : '' }} {{ f.primaryCrop ? '· ' + f.primaryCrop : '' }}</dd>
              <dt>Farm point</dt><dd>
                @if (f.farmLatitude != null) { <span class="mono">{{ f.farmLatitude.toFixed(6) }}, {{ f.farmLongitude!.toFixed(6) }}</span> }
                @else { <app-pill text="Not set — geofence disabled" tone="warn" /> }</dd>
              <dt>Category</dt><dd>{{ f.category | label }}</dd>
              <dt>Registered</dt><dd>{{ f.createdAt | date: 'mediumDate' }}</dd>
              @if (f.notes) { <dt>Notes</dt><dd>{{ f.notes }}</dd> }
            </dl>
          </mat-card-content>
        </mat-card>
        <div class="stack">
          <mat-card appearance="outlined">
            <mat-card-header><mat-card-title>Pumps</mat-card-title></mat-card-header>
            <mat-card-content>
              <table mat-table [dataSource]="f.devices ?? []">
                <ng-container matColumnDef="serial"><th mat-header-cell *matHeaderCellDef>Pump</th>
                  <td mat-cell *matCellDef="let d"><a [routerLink]="['/devices', d.id]">{{ d.serialNumber }}</a></td></ng-container>
                <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>Status</th>
                  <td mat-cell *matCellDef="let d"><app-device-status [status]="d.status" /></td></ng-container>
                <ng-container matColumnDef="geo"><th mat-header-cell *matHeaderCellDef>Location</th>
                  <td mat-cell *matCellDef="let d"><app-geofence [within]="d.lastWithinGeofence" [distance]="d.lastDistanceFromFarmMeters" /></td></ng-container>
                <ng-container matColumnDef="seen"><th mat-header-cell *matHeaderCellDef>Last seen</th>
                  <td mat-cell *matCellDef="let d">{{ d.lastSeenAt | ago }}</td></ng-container>
                <tr mat-header-row *matHeaderRowDef="dcols"></tr>
                <tr mat-row *matRowDef="let row; columns: dcols"></tr>
                <tr class="mat-row" *matNoDataRow><td class="mat-cell empty" [attr.colspan]="dcols.length">No pumps assigned.</td></tr>
              </table>
            </mat-card-content>
          </mat-card>
          <mat-card appearance="outlined">
            <mat-card-header><mat-card-title>Payments</mat-card-title></mat-card-header>
            <mat-card-content>
              <table mat-table [dataSource]="payments()">
                <ng-container matColumnDef="date"><th mat-header-cell *matHeaderCellDef>Paid</th>
                  <td mat-cell *matCellDef="let p">{{ p.paidAt | date: 'mediumDate' }}</td></ng-container>
                <ng-container matColumnDef="tx"><th mat-header-cell *matHeaderCellDef>Transaction</th>
                  <td mat-cell *matCellDef="let p" class="mono">{{ p.transactionId }}</td></ng-container>
                <ng-container matColumnDef="amount"><th mat-header-cell *matHeaderCellDef>Amount</th>
                  <td mat-cell *matCellDef="let p">{{ p.amount | currency: p.currency : 'symbol-narrow' }}</td></ng-container>
                <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>Status</th>
                  <td mat-cell *matCellDef="let p"><app-pill [text]="p.status | label" [tone]="p.status === 'COMPLETED' ? 'good' : 'bad'" /></td></ng-container>
                <tr mat-header-row *matHeaderRowDef="pcols"></tr>
                <tr mat-row *matRowDef="let row; columns: pcols"></tr>
                <tr class="mat-row" *matNoDataRow><td class="mat-cell empty" [attr.colspan]="pcols.length">No payments recorded.</td></tr>
              </table>
            </mat-card-content>
          </mat-card>
        </div>
      </div>
    }
  `,
  styles: `
    .head { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; justify-content: space-between; margin-bottom: 16px; }
    .back { display: inline-flex; align-items: center; gap: 4px; color: var(--mat-sys-on-surface-variant); text-decoration: none; font: var(--mat-sys-label-large); }
    h1 { font: var(--mat-sys-headline-small); margin: 6px 0 2px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .grid { display: grid; grid-template-columns: 380px 1fr; gap: 16px; }
    .stack { display: flex; flex-direction: column; gap: 16px; }
    @media (max-width: 959px) { .grid { grid-template-columns: 1fr; } }
    dl { display: grid; grid-template-columns: 110px 1fr; gap: 8px 12px; margin: 8px 0 0; }
    dt { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-label-medium); }
    dd { margin: 0; }
    table { width: 100%; }
    .muted { color: var(--mat-sys-on-surface-variant); }
    .mono { font-family: ui-monospace, monospace; font-size: 12px; }
    .empty { padding: 16px; text-align: center; color: var(--mat-sys-on-surface-variant); }
  `,
})
export class FarmerDetailPage implements OnInit {
  id = input.required<string>();
  auth = inject(AuthService);
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private notify = inject(Notify);
  private router = inject(Router);
  f = signal<Farmer | null>(null);
  payments = signal<Payment[]>([]);
  dcols = ['serial', 'status', 'geo', 'seen'];
  pcols = ['date', 'tx', 'amount', 'status'];

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.farmer(this.id()).subscribe({ next: (f) => this.f.set(f), error: (e) => this.notify.error(e) });
    this.api.payments({ farmerId: this.id(), pageSize: 100 }).subscribe((r) => this.payments.set(r.items));
  }

  edit() {
    this.dialog
      .open(FarmerFormDialog, { width: '760px', maxWidth: '96vw', data: { farmer: this.f()! } })
      .afterClosed()
      .subscribe((f?: Farmer) => {
        if (f) {
          this.notify.ok('Farmer updated');
          this.f.set(f);
        }
      });
  }

  assignPump() {
    this.dialog
      .open(DeviceFormDialog, { width: '760px', maxWidth: '96vw', data: { farmer: this.f()! } })
      .afterClosed()
      .subscribe((res?: { device: Device; ingestKey: string }) => {
        if (!res) return;
        showIngestKey(this.dialog, res.device.serialNumber, res.ingestKey);
        this.load();
      });
  }

  remove() {
    this.dialog
      .open(ConfirmDialog, { data: { title: 'Delete farmer?', message: 'Only possible when no pumps or payments are linked.', confirm: 'Delete' } })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.api.deleteFarmer(this.id()).subscribe({
          next: () => void this.router.navigate(['/farmers']),
          error: (e) => this.notify.error(e),
        });
      });
  }
}
