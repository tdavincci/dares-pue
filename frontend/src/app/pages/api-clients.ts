import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { ApiService } from '../core/api.service';
import { ApiClient, ApiToken } from '../core/models';
import { Notify } from '../core/notify';
import { AgoPipe, ConfirmDialog, Pill, SecretDialog } from '../shared/ui';

@Component({
  selector: 'app-api-clients',
  imports: [FormsModule, DatePipe, MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatTableModule, MatSlideToggleModule, AgoPipe, Pill],
  template: `
    <div class="head"><h1>API access</h1></div>

    <mat-card appearance="outlined" class="info">
      <mat-card-content>
        <p><strong>Odyssey Standard API</strong> — give the integrator the base URL and a token below. Every request must send
          <code>Authorization: Bearer &lt;token&gt;</code>.</p>
        <ul>
          <li><code>GET {{ origin }}/api/v1/odyssey/standard/meter/readings?FROM=…&amp;TO=…</code> — pump GPS positions</li>
          <li><code>GET {{ origin }}/api/v1/odyssey/standard/electricity/payments?FROM=…&amp;TO=…</code> — payments</li>
          <li><code>POST {{ origin }}/api/v1/odyssey/standard/token-renewal</code> — optional refresh-token flow</li>
        </ul>
        <a mat-stroked-button [href]="origin + '/api/v1/odyssey/standard/swagger-ui'" target="_blank" rel="noopener"><mat-icon>description</mat-icon>Open Swagger docs</a>
      </mat-card-content>
    </mat-card>

    <div class="new">
      <mat-form-field class="grow"><mat-label>New client name</mat-label><input matInput [(ngModel)]="newName" placeholder="Odyssey Energy Solutions" /></mat-form-field>
      <button mat-flat-button (click)="create()" [disabled]="!newName.trim()"><mat-icon>add</mat-icon>Add client</button>
    </div>

    @for (c of clients(); track c.id) {
      <mat-card appearance="outlined" class="client">
        <mat-card-header>
          <mat-card-title>{{ c.name }}</mat-card-title>
          <mat-card-subtitle>{{ c.description }} · last used {{ c.lastUsedAt | ago }}</mat-card-subtitle>
          <span class="spacer"></span>
          <mat-slide-toggle [checked]="c.isActive" (change)="toggle(c, $event.checked)">{{ c.isActive ? 'Enabled' : 'Disabled' }}</mat-slide-toggle>
        </mat-card-header>
        <mat-card-content>
          <table mat-table [dataSource]="c.tokens">
            <ng-container matColumnDef="prefix"><th mat-header-cell *matHeaderCellDef>Token</th>
              <td mat-cell *matCellDef="let t" class="mono">{{ t.tokenPrefix }}…</td></ng-container>
            <ng-container matColumnDef="label"><th mat-header-cell *matHeaderCellDef>Label</th>
              <td mat-cell *matCellDef="let t">{{ t.label ?? '—' }} <app-pill [text]="t.kind === 'STATIC' ? 'Static' : 'Renewed'" [tone]="t.kind === 'STATIC' ? 'info' : 'muted'" /></td></ng-container>
            <ng-container matColumnDef="exp"><th mat-header-cell *matHeaderCellDef>Expires</th>
              <td mat-cell *matCellDef="let t">{{ t.expiresAt ? (t.expiresAt | date: 'medium') : 'Never' }}</td></ng-container>
            <ng-container matColumnDef="used"><th mat-header-cell *matHeaderCellDef>Last used</th>
              <td mat-cell *matCellDef="let t">{{ t.lastUsedAt | ago }}</td></ng-container>
            <ng-container matColumnDef="act"><th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let t"><button mat-button (click)="revoke(c, t)">Revoke</button></td></ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols"></tr>
            <tr class="mat-row" *matNoDataRow><td class="mat-cell empty" [attr.colspan]="cols.length">No active tokens.</td></tr>
          </table>
        </mat-card-content>
        <mat-card-actions>
          <mat-form-field class="lbl"><mat-label>Token label</mat-label><input matInput [(ngModel)]="labels[c.id]" placeholder="production" /></mat-form-field>
          <mat-form-field class="days"><mat-label>Expires in (days)</mat-label><input matInput type="number" [(ngModel)]="days[c.id]" placeholder="never" /></mat-form-field>
          <button mat-flat-button (click)="issue(c)"><mat-icon>key</mat-icon>Issue access token</button>
          <button mat-stroked-button (click)="refresh(c)"><mat-icon>autorenew</mat-icon>Issue refresh token</button>
        </mat-card-actions>
      </mat-card>
    }
  `,
  styles: `
    .head h1 { font: var(--mat-sys-headline-small); margin: 0 0 16px; }
    .info code { background: var(--mat-sys-surface-container-high); padding: 1px 6px; border-radius: 4px; font-size: 12px; overflow-wrap: anywhere; }
    .info li { margin: 4px 0; }
    .new { display: flex; gap: 12px; align-items: center; margin: 16px 0; }
    .grow { flex: 1; }
    .client { margin-bottom: 16px; }
    .client mat-card-header { display: flex; align-items: center; }
    .spacer { flex: 1; }
    mat-card-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 8px 16px 16px; }
    .lbl { width: 200px; } .days { width: 150px; }
    table { width: 100%; }
    .mono { font-family: ui-monospace, monospace; font-size: 12px; }
    .empty { padding: 16px; text-align: center; color: var(--mat-sys-on-surface-variant); }
  `,
})
export class ApiClientsPage implements OnInit {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private notify = inject(Notify);
  origin = window.location.origin;
  clients = signal<ApiClient[]>([]);
  cols = ['prefix', 'label', 'exp', 'used', 'act'];
  newName = '';
  labels: Record<string, string> = {};
  days: Record<string, number | null> = {};

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.apiClients().subscribe({ next: (c) => this.clients.set(c), error: (e) => this.notify.error(e) });
  }

  create() {
    this.api.createApiClient({ name: this.newName.trim() }).subscribe({
      next: () => {
        this.newName = '';
        this.load();
      },
      error: (e) => this.notify.error(e),
    });
  }

  toggle(c: ApiClient, isActive: boolean) {
    this.api.updateApiClient(c.id, { isActive }).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) });
  }

  issue(c: ApiClient) {
    const d = this.days[c.id];
    this.api.issueToken(c.id, { label: this.labels[c.id] || undefined, expiresInDays: d ? Number(d) : undefined }).subscribe({
      next: (r) => {
        this.dialog.open(SecretDialog, {
          width: '600px',
          data: {
            title: `Access token for ${c.name}`,
            message: 'Copy this token now and share it securely with the integrator. It will not be shown again.',
            secrets: [
              { label: 'Authorization header', value: `Bearer ${r.token}` },
              { label: 'Token', value: r.token },
            ],
          },
        });
        this.load();
      },
      error: (e) => this.notify.error(e),
    });
  }

  refresh(c: ApiClient) {
    this.dialog
      .open(ConfirmDialog, { data: { title: 'Issue a refresh token?', message: 'Any previous refresh token for this client stops working.', confirm: 'Issue' } })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.api.issueRefreshToken(c.id).subscribe({
          next: (r) =>
            this.dialog.open(SecretDialog, {
              width: '600px',
              data: {
                title: `Refresh token for ${c.name}`,
                message: 'Used with POST /api/v1/odyssey/standard/token-renewal to obtain short-lived access tokens. Shown once.',
                secrets: [{ label: 'refreshToken', value: r.refreshToken }],
              },
            }),
          error: (e) => this.notify.error(e),
        });
      });
  }

  revoke(c: ApiClient, t: ApiToken) {
    this.dialog
      .open(ConfirmDialog, { data: { title: `Revoke ${t.tokenPrefix}…?`, message: 'Requests using this token will be rejected immediately.', confirm: 'Revoke' } })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.api.revokeToken(c.id, t.id).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) });
      });
  }
}
