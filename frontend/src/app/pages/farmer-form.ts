import { AfterViewInit, Component, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import * as L from 'leaflet';
import { ApiService } from '../core/api.service';
import { Farmer } from '../core/models';
import { Notify } from '../core/notify';
import { COLORS, createMap } from '../shared/leaflet';

@Component({
  selector: 'app-farmer-form',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data.farmer ? 'Edit ' + data.farmer.fullName : 'Register farmer' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="grid">
        <div class="section">Farmer</div>
        <mat-form-field><mat-label>Full name</mat-label><input matInput formControlName="fullName" required /></mat-form-field>
        <mat-form-field><mat-label>Phone</mat-label><input matInput formControlName="phone" required placeholder="+234…" /></mat-form-field>
        <mat-form-field><mat-label>Email</mat-label><input matInput type="email" formControlName="email" /></mat-form-field>
        <mat-form-field><mat-label>Account number</mat-label><input matInput formControlName="accountNumber" placeholder="Auto (DPF-000001)" />
          <mat-hint>Sent to Odyssey as customerAccountId</mat-hint></mat-form-field>
        <mat-form-field><mat-label>State</mat-label><input matInput formControlName="state" /></mat-form-field>
        <mat-form-field><mat-label>LGA</mat-label><input matInput formControlName="lga" /></mat-form-field>
        <mat-form-field><mat-label>Community / village</mat-label><input matInput formControlName="community" /></mat-form-field>
        <mat-form-field><mat-label>Category</mat-label><input matInput formControlName="category" /></mat-form-field>
        <mat-form-field class="wide"><mat-label>Address</mat-label><input matInput formControlName="address" /></mat-form-field>

        <div class="section">Farm (intended installation point)</div>
        <mat-form-field><mat-label>Farm name</mat-label><input matInput formControlName="farmName" /></mat-form-field>
        <mat-form-field><mat-label>Primary crop</mat-label><input matInput formControlName="primaryCrop" /></mat-form-field>
        <mat-form-field><mat-label>Farm latitude</mat-label><input matInput type="number" step="0.000001" formControlName="farmLatitude" /></mat-form-field>
        <mat-form-field><mat-label>Farm longitude</mat-label><input matInput type="number" step="0.000001" formControlName="farmLongitude" /></mat-form-field>
        <mat-form-field><mat-label>Farm size (ha)</mat-label><input matInput type="number" formControlName="farmSizeHectares" /></mat-form-field>
        <div class="loc"><button mat-stroked-button type="button" (click)="useMyLocation()"><mat-icon>my_location</mat-icon>Use my location</button></div>
        <div class="wide">
          <div class="hint">Click the map to set the farm point. Tracker positions are checked against it.</div>
          <div #mapEl class="map"></div>
        </div>
        <mat-form-field class="wide"><mat-label>Notes</mat-label><textarea matInput rows="2" formControlName="notes"></textarea></mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid || saving()">Save</button>
    </mat-dialog-actions>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; padding-top: 8px; }
    .section { grid-column: 1 / -1; font: var(--mat-sys-title-small); color: var(--mat-sys-primary); margin-top: 8px; }
    .wide { grid-column: 1 / -1; }
    .loc { display: flex; align-items: center; }
    .hint { font: var(--mat-sys-body-small); color: var(--mat-sys-on-surface-variant); margin-bottom: 6px; }
    .map { height: 260px; border-radius: 12px; border: 1px solid var(--mat-sys-outline-variant); z-index: 0; }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export class FarmerFormDialog implements AfterViewInit, OnDestroy {
  data = inject<{ farmer?: Farmer }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<FarmerFormDialog>);
  private api = inject(ApiService);
  private notify = inject(Notify);
  mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  saving = signal(false);
  private map?: L.Map;
  private marker?: L.Marker | L.CircleMarker;

  form = inject(FormBuilder).group({
    fullName: ['', Validators.required],
    phone: ['', [Validators.required, Validators.pattern(/^\+?[0-9 ()-]{7,20}$/)]],
    email: ['', Validators.email],
    accountNumber: [''],
    state: ['Adamawa'],
    lga: [''],
    community: [''],
    category: ['IRRIGATION_FARMER'],
    address: [''],
    farmName: [''],
    primaryCrop: [''],
    farmLatitude: [null as number | null, [Validators.min(-90), Validators.max(90)]],
    farmLongitude: [null as number | null, [Validators.min(-180), Validators.max(180)]],
    farmSizeHectares: [null as number | null],
    notes: [''],
  });

  constructor() {
    if (this.data.farmer) this.form.patchValue(this.data.farmer as never);
    this.form.controls.farmLatitude.valueChanges.subscribe(() => this.placeMarker(false));
    this.form.controls.farmLongitude.valueChanges.subscribe(() => this.placeMarker(false));
  }

  ngAfterViewInit() {
    // Wait for the dialog open animation so Leaflet measures the right size.
    setTimeout(() => {
      this.map = createMap(this.mapEl().nativeElement);
      this.map.on('click', (e: L.LeafletMouseEvent) => {
        this.form.patchValue({ farmLatitude: +e.latlng.lat.toFixed(6), farmLongitude: +e.latlng.lng.toFixed(6) });
      });
      this.placeMarker(true);
    }, 250);
  }

  ngOnDestroy() {
    this.map?.remove();
  }

  private placeMarker(center: boolean) {
    const { farmLatitude: lat, farmLongitude: lng } = this.form.getRawValue();
    if (!this.map || lat == null || lng == null || isNaN(+lat) || isNaN(+lng)) return;
    this.marker?.remove();
    this.marker = L.circleMarker([+lat, +lng], { radius: 9, color: '#fff', weight: 2, fillColor: COLORS.farm, fillOpacity: 1 }).addTo(this.map);
    if (center) this.map.setView([+lat, +lng], 15);
  }

  useMyLocation() {
    if (!navigator.geolocation) return this.notify.error({ message: 'Geolocation not available' });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        this.form.patchValue({ farmLatitude: +p.coords.latitude.toFixed(6), farmLongitude: +p.coords.longitude.toFixed(6) });
        this.placeMarker(true);
      },
      () => this.notify.error({ message: 'Could not get your location' }),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  save() {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const editing = !!this.data.farmer;
    const body: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === '' || val === null) {
        if (editing && k !== 'accountNumber') body[k] = null;
      } else body[k] = typeof val === 'string' ? val.trim() : val;
    }
    if (editing && !v.accountNumber) delete body['accountNumber'];
    this.saving.set(true);
    const req = editing ? this.api.updateFarmer(this.data.farmer!.id, body as Partial<Farmer>) : this.api.createFarmer(body as Partial<Farmer>);
    req.subscribe({
      next: (f) => this.ref.close(f),
      error: (e) => {
        this.notify.error(e);
        this.saving.set(false);
      },
    });
  }
}
