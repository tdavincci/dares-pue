import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, startWith, Subject, switchMap } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth';
import { Device, Payment, PAYMENT_METHODS } from '../core/models';
import { Notify } from '../core/notify';
import { ConfirmDialog, LabelPipe, Pill } from '../shared/ui';

@Component({
  selector: 'app-payment-form',
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatAutocompleteModule, MatDatepickerModule, MatIconModule, CurrencyPipe, LabelPipe,
  ],
  template: `
    <h2 mat-dialog-title>Record full payment</h2>
    <mat-dialog-content>
      <p class="note"><mat-icon>info</mat-icon> Only full payment is accepted. One payment per pump; the amount must equal the pump price.</p>
      <form [formGroup]="form" class="col">
        @if (data.device) {
          <div class="summary">
            <div><strong>{{ data.device.serialNumber }}</strong></div>
            <div>{{ data.device.farmer?.fullName }} · {{ data.device.farmer?.accountNumber }}</div>
          </div>
        } @else {
          <mat-form-field><mat-label>Pump</mat-label>
            <input matInput [formControl]="deviceSearch" [matAutocomplete]="auto" placeholder="Search serial, IMEI or farmer" />
            <mat-autocomplete #auto="matAutocomplete" [displayWith]="deviceLabel" (optionSelected)="pickDevice($event.option.value)">
              @for (d of deviceOptions(); track d.id) {
                <mat-option [value]="d" [disabled]="!d.farmer">{{ d.serialNumber }} · {{ d.farmer?.fullName ?? 'unassigned' }}</mat-option>
              }
            </mat-autocomplete></mat-form-field>
        }
        <mat-form-field><mat-label>Amount</mat-label><span matTextPrefix>₦&nbsp;</span>
          <input matInput type="number" formControlName="amount" [readonly]="device()?.price != null" />
          @if (device()?.price != null) { <mat-hint>Pump price {{ device()!.price | currency: 'NGN' : 'symbol-narrow' }}</mat-hint> }
        </mat-form-field>
        <mat-form-field><mat-label>Method</mat-label>
          <mat-select formControlName="method">@for (m of methods; track m) { <mat-option [value]="m">{{ m | label }}</mat-option> }</mat-select></mat-form-field>
        <mat-form-field><mat-label>Reference (teller / transfer / POS RRN)</mat-label><input matInput formControlName="reference" /></mat-form-field>
        <mat-form-field><mat-label>Date paid</mat-label>
          <input matInput [matDatepicker]="dp" formControlName="paidAt" [max]="today" />
          <mat-datepicker-toggle matIconSuffix [for]="dp" /><mat-datepicker #dp /></mat-form-field>
        <mat-form-field><mat-label>Notes</mat-label><textarea matInput rows="2" formControlName="notes"></textarea></mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid || !device() || saving()">Record payment</button>
    </mat-dialog-actions>
  `,
  styles: `
    .col { display: flex; flex-direction: column; gap: 12px; }
    .note { display: flex; gap: 8px; align-items: flex-start; background: var(--mat-sys-secondary-container); color: var(--mat-sys-on-secondary-container); padding: 10px 12px; border-radius: 8px; font: var(--mat-sys-body-small); }
    .summary { padding: 12px; border-radius: 8px; background: var(--mat-sys-surface-container); }
  `,
})
export class PaymentFormDialog implements OnInit {
  data = inject<{ device?: Device }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<PaymentFormDialog>);
  private api = inject(ApiService);
  private notify = inject(Notify);
  private fb = inject(FormBuilder);
  methods = PAYMENT_METHODS;
  today = new Date();
  saving = signal(false);
  device = signal<Device | null>(null);
  deviceOptions = signal<Device[]>([]);
  deviceSearch = this.fb.control<string | Device>('');
  form = this.fb.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    method: ['BANK_TRANSFER', Validators.required],
    reference: [''],
    paidAt: [new Date(), Validators.required],
    notes: [''],
  });

  ngOnInit() {
    if (this.data.device) this.pickDevice(this.data.device);
    else
      this.deviceSearch.valueChanges
        .pipe(
          startWith(''),
          debounceTime(250),
          distinctUntilChanged(),
          switchMap((v) => this.api.devices({ search: typeof v === 'string' ? v : '', pageSize: 20 })),
        )
        .subscribe((r) => this.deviceOptions.set(r.items));
  }

  deviceLabel = (d: Device | string | null) => (d && typeof d === 'object' ? `${d.serialNumber} · ${d.farmer?.fullName ?? ''}` : (d ?? ''));

  pickDevice(d: Device) {
    this.device.set(d);
    if (d.price != null) this.form.patchValue({ amount: d.price });
  }

  save() {
    const d = this.device();
    if (!d || this.form.invalid) return;
    const v = this.form.getRawValue();
    const paid = new Date(v.paidAt!);
    const now = new Date();
    // Date picker gives local midnight; keep current time when the date is today.
    if (paid.toDateString() === now.toDateString()) paid.setTime(now.getTime());
    this.saving.set(true);
    this.api
      .createPayment({
        deviceId: d.id,
        amount: Number(v.amount),
        currency: d.currency,
        method: v.method,
        reference: v.reference || undefined,
        paidAt: paid.toISOString(),
        notes: v.notes || undefined,
      })
      .subscribe({
        next: (p) => this.ref.close(p),
        error: (e) => {
          this.notify.error(e);
          this.saving.set(false);
        },
      });
  }
}

@Component({
  selector: 'app-payments',
  imports: [
    FormsModule, RouterLink, DatePipe, CurrencyPipe, MatTableModule, MatPaginatorModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatIconModule, MatMenuModule, MatProgressBarModule, LabelPipe, Pill,
  ],
  template: `
    <div class="head">
      <h1>Payments</h1>
      @if (auth.canEdit()) { <button mat-flat-button (click)="record()"><mat-icon>add</mat-icon>Record payment</button> }
    </div>
    <div class="filters">
      <mat-form-field class="search"><mat-label>Search</mat-label><mat-icon matPrefix>search</mat-icon>
        <input matInput [(ngModel)]="search" (ngModelChange)="search$.next()" placeholder="Transaction, reference, farmer, pump" /></mat-form-field>
      <mat-form-field><mat-label>Status</mat-label>
        <mat-select [(ngModel)]="status" (ngModelChange)="reload()">
          <mat-option value="">Any</mat-option><mat-option value="COMPLETED">Completed</mat-option><mat-option value="REVERSED">Reversed</mat-option>
        </mat-select></mat-form-field>
    </div>
    <div class="table-wrap">
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      <table mat-table [dataSource]="rows()">
        <ng-container matColumnDef="date"><th mat-header-cell *matHeaderCellDef>Paid</th>
          <td mat-cell *matCellDef="let p">{{ p.paidAt | date: 'mediumDate' }}</td></ng-container>
        <ng-container matColumnDef="tx"><th mat-header-cell *matHeaderCellDef>Transaction</th>
          <td mat-cell *matCellDef="let p"><div class="mono">{{ p.transactionId }}</div><div class="muted">{{ p.reference }}</div></td></ng-container>
        <ng-container matColumnDef="farmer"><th mat-header-cell *matHeaderCellDef>Farmer</th>
          <td mat-cell *matCellDef="let p"><a [routerLink]="['/farmers', p.farmerId]">{{ p.farmer?.fullName }}</a><div class="muted">{{ p.farmer?.accountNumber }}</div></td></ng-container>
        <ng-container matColumnDef="device"><th mat-header-cell *matHeaderCellDef>Pump</th>
          <td mat-cell *matCellDef="let p"><a [routerLink]="['/devices', p.deviceId]">{{ p.device?.serialNumber }}</a></td></ng-container>
        <ng-container matColumnDef="amount"><th mat-header-cell *matHeaderCellDef class="num">Amount</th>
          <td mat-cell *matCellDef="let p" class="num">{{ p.amount | currency: p.currency : 'symbol-narrow' }}</td></ng-container>
        <ng-container matColumnDef="method"><th mat-header-cell *matHeaderCellDef>Method</th>
          <td mat-cell *matCellDef="let p">{{ p.method | label }}</td></ng-container>
        <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>Status</th>
          <td mat-cell *matCellDef="let p"><app-pill [text]="p.status | label" [tone]="p.status === 'COMPLETED' ? 'good' : 'bad'" />
            @if (p.reversalReason) { <div class="muted">{{ p.reversalReason }}</div> }</td></ng-container>
        <ng-container matColumnDef="by"><th mat-header-cell *matHeaderCellDef>Recorded by</th>
          <td mat-cell *matCellDef="let p" class="muted">{{ p.recordedBy?.fullName ?? '—' }}</td></ng-container>
        <ng-container matColumnDef="act"><th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let p">
            @if (auth.isAdmin() && p.status === 'COMPLETED') {
              <button mat-icon-button [matMenuTriggerFor]="m" aria-label="Actions"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #m="matMenu"><button mat-menu-item (click)="reverse(p)"><mat-icon>undo</mat-icon>Reverse payment</button></mat-menu>
            }
          </td></ng-container>
        <tr mat-header-row *matHeaderRowDef="cols; sticky: true"></tr>
        <tr mat-row *matRowDef="let row; columns: cols"></tr>
        <tr class="mat-row" *matNoDataRow><td class="mat-cell empty" [attr.colspan]="cols.length">No payments yet.</td></tr>
      </table>
      <mat-paginator [length]="total()" [pageSize]="pageSize" [pageIndex]="page - 1" [pageSizeOptions]="[25, 50, 100]" (page)="onPage($event)" />
    </div>
  `,
  styles: `
    .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    h1 { font: var(--mat-sys-headline-small); margin: 0; }
    .filters { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
    .search { flex: 1; min-width: 240px; }
    .table-wrap { border: 1px solid var(--mat-sys-outline-variant); border-radius: 16px; overflow: auto; }
    table { width: 100%; }
    .num { text-align: right; }
    .mono { font-family: ui-monospace, monospace; font-size: 12px; }
    .muted { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
    .empty { padding: 24px; text-align: center; color: var(--mat-sys-on-surface-variant); }
  `,
})
export class PaymentsPage implements OnInit {
  auth = inject(AuthService);
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private notify = inject(Notify);
  cols = ['date', 'tx', 'farmer', 'device', 'amount', 'method', 'status', 'by', 'act'];
  rows = signal<Payment[]>([]);
  total = signal(0);
  loading = signal(false);
  search = '';
  status = '';
  page = 1;
  pageSize = 25;
  search$ = new Subject<void>();

  ngOnInit() {
    this.search$.pipe(debounceTime(300)).subscribe(() => this.reload());
    this.load();
  }

  reload() {
    this.page = 1;
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.payments({ search: this.search, status: this.status, page: this.page, pageSize: this.pageSize }).subscribe({
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

  record() {
    this.dialog
      .open(PaymentFormDialog, { width: '520px', maxWidth: '96vw', data: {} })
      .afterClosed()
      .subscribe((p?: Payment) => {
        if (!p) return;
        this.notify.ok(`Payment ${p.transactionId} recorded`);
        this.reload();
      });
  }

  reverse(p: Payment) {
    this.dialog
      .open(ConfirmDialog, {
        data: { title: `Reverse ${p.transactionId}?`, message: 'The payment will no longer be reported to Odyssey and the pump becomes unpaid.', confirm: 'Reverse', input: 'Reason' },
      })
      .afterClosed()
      .subscribe((reason?: string) => {
        if (!reason) return;
        this.api.reversePayment(p.id, reason).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) });
      });
  }
}
