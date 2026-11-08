import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { debounceTime, distinctUntilChanged, Observable, startWith, switchMap } from 'rxjs';
import { ApiService } from '../core/api.service';
import { environment } from '../../environments/environment';
import { Device, DEVICE_STATUSES, Farmer } from '../core/models';
import { Notify } from '../core/notify';
import { LabelPipe } from '../shared/ui';

export interface DeviceFormData {
  device?: Device;
  imei?: string;
  farmer?: Farmer;
}

@Component({
  selector: 'app-device-form',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatAutocompleteModule,
    MatIconModule,
    MatDatepickerModule,
    LabelPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.device ? 'Edit pump ' + data.device.serialNumber : 'Register pump & tracker' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="grid">
        <div class="section">Pump</div>
        <mat-form-field><mat-label>Pump serial number</mat-label><input matInput formControlName="serialNumber" required />
          <mat-hint>Sent to Odyssey as meterId</mat-hint></mat-form-field>
        <mat-form-field><mat-label>Pump model</mat-label><input matInput formControlName="pumpModel" /></mat-form-field>
        <mat-form-field><mat-label>Capacity</mat-label><input matInput formControlName="pumpCapacity" placeholder="e.g. 1.5HP / 20m head" /></mat-form-field>
        <mat-form-field><mat-label>Full price</mat-label><span matTextPrefix>₦&nbsp;</span>
          <input matInput type="number" formControlName="price" min="0" />
          <mat-hint>Payment must equal this amount</mat-hint></mat-form-field>

        <div class="section">GPS tracker</div>
        <mat-form-field><mat-label>Tracker IMEI</mat-label><input matInput formControlName="trackerImei" required inputmode="numeric" />
          <mat-hint>15 digits, printed on the tracker</mat-hint>
          @if (form.controls.trackerImei.hasError('pattern')) { <mat-error>10–17 digits</mat-error> }</mat-form-field>
        <mat-form-field><mat-label>Tracker model</mat-label><input matInput formControlName="trackerModel" /></mat-form-field>
        <mat-form-field><mat-label>Tracker SIM number</mat-label><input matInput formControlName="trackerSimNumber" /></mat-form-field>
        <mat-form-field><mat-label>Status</mat-label>
          <mat-select formControlName="status">
            @for (s of statuses; track s) { <mat-option [value]="s">{{ s | label }}</mat-option> }
          </mat-select></mat-form-field>

        <div class="section">Assignment</div>
        <mat-form-field class="wide"><mat-label>Farmer</mat-label>
          <input matInput [formControl]="farmerSearch" [matAutocomplete]="auto" placeholder="Search by name, phone or account" />
          @if (selectedFarmer()) {
            <button mat-icon-button matSuffix type="button" (click)="clearFarmer()" aria-label="Clear"><mat-icon>close</mat-icon></button>
          }
          <mat-autocomplete #auto="matAutocomplete" [displayWith]="farmerLabel" (optionSelected)="pickFarmer($event.option.value)">
            @for (f of farmerOptions(); track f.id) {
              <mat-option [value]="f">{{ f.fullName }} · {{ f.accountNumber }} · {{ f.phone }}</mat-option>
            }
          </mat-autocomplete>
          @if (selectedFarmer() && selectedFarmer()!.farmLatitude == null) {
            <mat-hint class="warn">This farmer has no farm location — geofence checks will be skipped.</mat-hint>
          }
        </mat-form-field>
        <mat-form-field><mat-label>Geofence radius (m)</mat-label><input matInput type="number" formControlName="geofenceRadiusMeters" min="20" /></mat-form-field>
        <mat-form-field><mat-label>Installed on</mat-label>
          <input matInput [matDatepicker]="dp" formControlName="installedAt" />
          <mat-datepicker-toggle matIconSuffix [for]="dp" /><mat-datepicker #dp /></mat-form-field>
        <mat-form-field><mat-label>Contract / financing ID</mat-label><input matInput formControlName="financingId" /></mat-form-field>
        <mat-form-field><mat-label>Report interval (min)</mat-label><input matInput type="number" formControlName="reportIntervalMinutes" min="1" /></mat-form-field>
        <mat-form-field class="wide"><mat-label>Notes</mat-label><textarea matInput formControlName="notes" rows="2"></textarea></mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid || saving()">{{ data.device ? 'Save' : 'Register' }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; padding-top: 8px; }
    .section { grid-column: 1 / -1; font: var(--mat-sys-title-small); color: var(--mat-sys-primary); margin-top: 8px; }
    .wide { grid-column: 1 / -1; }
    .warn { color: #b06000; }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export class DeviceFormDialog implements OnInit {
  data = inject<DeviceFormData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<DeviceFormDialog>);
  private api = inject(ApiService);
  private notify = inject(Notify);
  private fb = inject(FormBuilder);
  statuses = DEVICE_STATUSES;
  saving = signal(false);
  farmerOptions = signal<Farmer[]>([]);
  selectedFarmer = signal<Farmer | null>(null);

  form = this.fb.group({
    serialNumber: ['', Validators.required],
    pumpModel: [''],
    pumpCapacity: [''],
    price: [null as number | null],
    trackerImei: ['', [Validators.required, Validators.pattern(/^[0-9]{10,17}$/)]],
    trackerModel: ['GT06'],
    trackerSimNumber: [''],
    status: ['REGISTERED'],
    geofenceRadiusMeters: [environment.defaultGeofenceRadiusMeters, [Validators.required, Validators.min(20)]],
    installedAt: [null as Date | null],
    financingId: [''],
    reportIntervalMinutes: [1, [Validators.min(1)]],
    notes: [''],
  });
  farmerSearch = this.fb.control<string | Farmer>('');

  ngOnInit() {
    const d = this.data.device;
    if (d) {
      this.form.patchValue({ ...d, installedAt: d.installedAt ? new Date(d.installedAt) : null } as never);
      if (d.farmer) this.pickFarmer(d.farmer);
    }
    if (this.data.imei) this.form.patchValue({ trackerImei: this.data.imei });
    if (this.data.farmer) this.pickFarmer(this.data.farmer);

    this.farmerSearch.valueChanges
      .pipe(
        startWith(''),
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((v) => this.api.farmers({ search: typeof v === 'string' ? v : '', pageSize: 20 })),
      )
      .subscribe((r) => this.farmerOptions.set(r.items));
  }

  farmerLabel = (f: Farmer | string | null) => (f && typeof f === 'object' ? `${f.fullName} (${f.accountNumber})` : (f ?? ''));

  pickFarmer(f: Farmer) {
    this.selectedFarmer.set(f);
    this.farmerSearch.setValue(f, { emitEvent: false });
    if (!this.data.device && this.form.value.status === 'REGISTERED') this.form.patchValue({ status: 'ACTIVE' });
  }

  clearFarmer() {
    this.selectedFarmer.set(null);
    this.farmerSearch.setValue('');
  }

  save() {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const body: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === '' || val === null) {
        if (this.data.device) body[k] = null;
        continue;
      }
      body[k] = val;
    }
    // Only send nullable-friendly fields as null on edit.
    for (const k of ['serialNumber', 'trackerImei', 'status', 'trackerModel', 'geofenceRadiusMeters', 'reportIntervalMinutes', 'price']) {
      if (body[k] === null) delete body[k];
    }
    body['installedAt'] = v.installedAt ? new Date(v.installedAt).toISOString() : this.data.device ? null : undefined;
    body['farmerId'] = this.selectedFarmer()?.id ?? (this.data.device ? null : undefined);
    if (body['price'] !== undefined) body['price'] = Number(body['price']);

    this.saving.set(true);
    const req: Observable<unknown> = this.data.device ? this.api.updateDevice(this.data.device.id, body) : this.api.createDevice(body);
    req.subscribe({
      next: (res) => this.ref.close(res),
      error: (e: unknown) => {
        this.notify.error(e);
        this.saving.set(false);
      },
    });
  }
}
