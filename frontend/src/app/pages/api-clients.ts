import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, Subject } from 'rxjs';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { API_ORIGIN, ApiService } from '../core/api.service';
import { ApiAccessLog, ApiClient, ApiToken } from '../core/models';
import { LiveService } from '../core/live.service';
import { Notify } from '../core/notify';
import { AgoPipe, ConfirmDialog, Pill, SecretDialog } from '../shared/ui';

@Component({
  selector: 'app-api-clients',
  imports: [FormsModule, DatePipe, MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatTableModule, MatSlideToggleModule, MatPaginatorModule, MatSelectModule, MatTooltipModule, AgoPipe, Pill],
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

    <mat-card appearance="outlined" class="history">
      <mat-card-header>
        <mat-card-title>Request history</mat-card-title>
        <mat-card-subtitle>What Odyssey requested and what it got back · newest first</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div class="filters">
          <mat-form-field><mat-label>Result</mat-label>
            <mat-select [(ngModel)]="logSuccess" (ngModelChange)="reloadLog()">
              <mat-option value="">All</mat-option><mat-option value="true">Success</mat-option><mat-option value="false">Failed</mat-option>
            </mat-select></mat-form-field>
          <mat-form-field><mat-label>Endpoint</mat-label>
            <mat-select [(ngModel)]="logEndpoint" (ngModelChange)="reloadLog()">
              <mat-option value="">All</mat-option>
              <mat-option value="readings">Meter readings</mat-option>
              <mat-option value="payments">Payments</mat-option>
              <mat-option value="token-renewal">Token renewal</mat-option>
            </mat-select></mat-form-field>
          @if (clients().length > 1) {
            <mat-form-field><mat-label>Client</mat-label>
              <mat-select [(ngModel)]="logClient" (ngModelChange)="reloadLog()">
                <mat-option value="">All</mat-option>
                @for (c of clients(); track c.id) { <mat-option [value]="c.id">{{ c.name }}</mat-option> }
              </mat-select></mat-form-field>
          }
          <span class="spacer"></span>
          <button mat-icon-button (click)="loadLog()" aria-label="Refresh history"><mat-icon>refresh</mat-icon></button>
        </div>
        <div class="table-wrap">
          <table mat-table [dataSource]="log()">
            <ng-container matColumnDef="when"><th mat-header-cell *matHeaderCellDef>When</th>
              <td mat-cell *matCellDef="let l" [matTooltip]="(l.createdAt | date: 'medium') ?? ''">{{ l.createdAt | ago }}</td></ng-container>
            <ng-container matColumnDef="client"><th mat-header-cell *matHeaderCellDef>Client</th>
              <td mat-cell *matCellDef="let l">
                {{ l.clientName ?? 'Unknown caller' }}
                @if (l.tokenPrefix) { <div class="muted mono">{{ l.tokenPrefix }}…</div> }
              </td></ng-container>
            <ng-container matColumnDef="request"><th mat-header-cell *matHeaderCellDef>Request</th>
              <td mat-cell *matCellDef="let l">
                <div><span class="method">{{ l.method }}</span> {{ endpointLabel(l.endpoint) }}</div>
                <div class="muted mono url" [matTooltip]="l.url">{{ l.url }}</div>
              </td></ng-container>
            <ng-container matColumnDef="result"><th mat-header-cell *matHeaderCellDef>Result</th>
              <td mat-cell *matCellDef="let l">
                <app-pill [text]="(l.success ? 'Success' : 'Failed') + ' · ' + l.statusCode" [tone]="l.success ? 'good' : 'bad'" />
                <div [class.err]="!l.success" class="summary">{{ l.success ? l.summary : (l.error ?? l.summary) }}</div>
              </td></ng-container>
            <ng-container matColumnDef="time"><th mat-header-cell *matHeaderCellDef>Took</th>
              <td mat-cell *matCellDef="let l" class="muted">{{ l.durationMs }} ms</td></ng-container>
            <tr mat-header-row *matHeaderRowDef="logCols"></tr>
            <tr mat-row *matRowDef="let row; columns: logCols"></tr>
            <tr class="mat-row" *matNoDataRow><td class="mat-cell empty" [attr.colspan]="logCols.length">No requests recorded yet.</td></tr>
          </table>
        </div>
        <mat-paginator [length]="logTotal()" [pageSize]="logPageSize" [pageIndex]="logPage - 1" [pageSizeOptions]="[10, 25, 50, 100]" (page)="onLogPage($event)" />
      </mat-card-content>
    </mat-card>
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
    .history .filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 12px; }
    .table-wrap { overflow-x: auto; }
    .muted { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
    .url { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .method { font: var(--mat-sys-label-small); font-weight: 700; padding: 1px 6px; border-radius: 4px; background: var(--mat-sys-surface-container-high); }
    .summary { margin-top: 4px; font: var(--mat-sys-body-small); max-width: 360px; }
    .err { color: var(--mat-sys-error); }
  `,
})
export class ApiClientsPage implements OnInit {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private notify = inject(Notify);
  private live = inject(LiveService);
  private destroyRef = inject(DestroyRef);
  private logRefresh$ = new Subject<void>();
  /** Backend origin shown in the Odyssey URLs (the portal's own origin when the API is same-origin). */
  origin = API_ORIGIN || window.location.origin;
  clients = signal<ApiClient[]>([]);
  cols = ['prefix', 'label', 'exp', 'used', 'act'];
  newName = '';
  labels: Record<string, string> = {};
  days: Record<string, number | null> = {};

  log = signal<ApiAccessLog[]>([]);
  logTotal = signal(0);
  logCols = ['when', 'client', 'request', 'result', 'time'];
  logSuccess = '';
  logEndpoint = '';
  logClient = '';
  logPage = 1;
  logPageSize = 25;

  ngOnInit() {
    this.load();
    this.loadLog();
    // New requests appear without a manual refresh (batched, so a burst of paged calls reloads once).
    this.logRefresh$.pipe(debounceTime(1000), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.loadLog();
      this.load(); // "last used" times
    });
    this.live
      .stream(['api'])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.logPage === 1) this.logRefresh$.next();
      });
  }

  endpointLabel(e: string) {
    return ({ readings: 'Meter readings', payments: 'Payments', 'token-renewal': 'Token renewal' } as Record<string, string>)[e] ?? e;
  }

  reloadLog() {
    this.logPage = 1;
    this.loadLog();
  }

  loadLog() {
    this.api
      .apiAccessLog({
        success: this.logSuccess,
        endpoint: this.logEndpoint,
        clientId: this.logClient,
        page: this.logPage,
        pageSize: this.logPageSize,
      })
      .subscribe({
        next: (r) => {
          this.log.set(r.items);
          this.logTotal.set(r.total);
        },
        error: (e) => this.notify.error(e),
      });
  }

  onLogPage(e: PageEvent) {
    this.logPage = e.pageIndex + 1;
    this.logPageSize = e.pageSize;
    this.loadLog();
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
