import { AfterViewInit, Component, computed, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router } from '@angular/router';
import * as L from 'leaflet';
import { ApiService } from '../core/api.service';
import { MapDevice } from '../core/models';
import { Notify } from '../core/notify';
import { COLORS, createMap, deviceColor, escapeHtml } from '../shared/leaflet';
import { AgoPipe, DistancePipe } from '../shared/ui';

type Filter = 'all' | 'online' | 'offline' | 'outside';

@Component({
  selector: 'app-map',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatListModule, MatSlideToggleModule, AgoPipe, DistancePipe],
  template: `
    <div class="head">
      <h1>Live map</h1>
      <div class="tools">
        <mat-button-toggle-group [ngModel]="filter()" (ngModelChange)="filter.set($event); render()" hideSingleSelectionIndicator>
          <mat-button-toggle value="all">All ({{ devices().length }})</mat-button-toggle>
          <mat-button-toggle value="online">Online</mat-button-toggle>
          <mat-button-toggle value="offline">Offline</mat-button-toggle>
          <mat-button-toggle value="outside">Outside farm</mat-button-toggle>
        </mat-button-toggle-group>
        <mat-slide-toggle [ngModel]="showFarms()" (ngModelChange)="showFarms.set($event); render()">Farm geofences</mat-slide-toggle>
        <button mat-icon-button (click)="load()" aria-label="Refresh"><mat-icon>refresh</mat-icon></button>
      </div>
    </div>
    <div class="layout">
      <div #mapEl class="map"></div>
      <aside class="side">
        <div class="legend">
          <span><i [style.background]="C.ok"></i>On farm</span>
          <span><i [style.background]="C.outside"></i>Outside farm</span>
          <span><i [style.background]="C.offline"></i>Offline</span>
          <span><i [style.background]="C.unknown"></i>No farm point</span>
          <span><i class="ring" [style.border-color]="C.farm"></i>Farm geofence</span>
        </div>
        <mat-nav-list dense>
          @for (d of visible(); track d.id) {
            <a mat-list-item (click)="focus(d)">
              <span class="dot" matListItemIcon [style.background]="color(d)"></span>
              <span matListItemTitle>{{ d.serialNumber }}</span>
              <span matListItemLine>{{ d.farmer?.fullName ?? 'Unassigned' }} · {{ d.lastSeenAt | ago }}</span>
              @if (d.withinGeofence === false) {
                <span matListItemLine class="bad">{{ d.distanceFromFarmMeters | distance }} from farm</span>
              }
            </a>
          } @empty { <p class="empty">No pumps match this filter.</p> }
        </mat-nav-list>
      </aside>
    </div>
  `,
  styles: `
    .head { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    h1 { font: var(--mat-sys-headline-small); margin: 0; }
    .tools { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .layout { display: grid; grid-template-columns: 1fr 320px; gap: 16px; height: calc(100vh - 190px); min-height: 480px; }
    .map { border-radius: 16px; border: 1px solid var(--mat-sys-outline-variant); z-index: 0; }
    .side { overflow: auto; border: 1px solid var(--mat-sys-outline-variant); border-radius: 16px; }
    .legend { display: flex; flex-wrap: wrap; gap: 10px 14px; padding: 12px 16px; font: var(--mat-sys-label-small); border-bottom: 1px solid var(--mat-sys-outline-variant); }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
    .legend i.ring { background: transparent; border: 2px dashed; width: 8px; height: 8px; }
    .dot { width: 12px !important; height: 12px !important; border-radius: 50%; }
    .bad { color: var(--mat-sys-error) !important; }
    .empty { padding: 16px; color: var(--mat-sys-on-surface-variant); }
    @media (max-width: 959px) { .layout { grid-template-columns: 1fr; height: auto; } .map { height: 60vh; } .side { max-height: 40vh; } }
  `,
})
export class MapPage implements AfterViewInit, OnDestroy {
  private api = inject(ApiService);
  private notify = inject(Notify);
  private router = inject(Router);
  mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  C = COLORS;

  devices = signal<MapDevice[]>([]);
  filter = signal<Filter>('all');
  showFarms = signal(true);
  visible = computed(() => {
    const f = this.filter();
    return this.devices().filter((d) =>
      f === 'all' ? true : f === 'online' ? d.online : f === 'offline' ? !d.online : d.withinGeofence === false,
    );
  });

  private map?: L.Map;
  private layer = L.layerGroup();
  private markers = new Map<string, L.CircleMarker>();
  private fitted = false;
  private timer?: ReturnType<typeof setInterval>;

  ngAfterViewInit() {
    this.map = createMap(this.mapEl().nativeElement);
    this.layer.addTo(this.map);
    this.load();
    this.timer = setInterval(() => this.load(), 30_000);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
    this.map?.remove();
  }

  color = deviceColor;

  load() {
    this.api.deviceMap().subscribe({
      next: (d) => {
        this.devices.set(d);
        this.render();
      },
      error: (e) => this.notify.error(e),
    });
  }

  render() {
    if (!this.map) return;
    this.layer.clearLayers();
    this.markers.clear();
    const bounds: L.LatLngExpression[] = [];
    for (const d of this.visible()) {
      const fl = d.farmer?.farmLatitude;
      const fn = d.farmer?.farmLongitude;
      if (this.showFarms() && fl != null && fn != null) {
        L.circle([fl, fn], {
          radius: d.geofenceRadiusMeters,
          color: COLORS.farm,
          weight: 2,
          dashArray: '6 6',
          fillOpacity: 0.08,
        }).addTo(this.layer);
        if (d.withinGeofence === false) {
          L.polyline([[fl, fn], [d.latitude, d.longitude]], { color: COLORS.outside, weight: 2, dashArray: '4 6' }).addTo(this.layer);
        }
      }
      const m = L.circleMarker([d.latitude, d.longitude], {
        radius: 9,
        color: '#fff',
        weight: 2,
        fillColor: deviceColor(d),
        fillOpacity: 1,
      })
        .bindPopup(this.popup(d))
        .on('popupopen', (ev) => {
          const el = ev.popup.getElement()?.querySelector('a.open');
          el?.addEventListener('click', (e) => {
            e.preventDefault();
            void this.router.navigate(['/devices', d.id]);
          });
        })
        .addTo(this.layer);
      this.markers.set(d.id, m);
      bounds.push([d.latitude, d.longitude]);
    }
    if (!this.fitted && bounds.length) {
      this.map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 });
      this.fitted = true;
    }
  }

  focus(d: MapDevice) {
    this.map?.setView([d.latitude, d.longitude], 16);
    this.markers.get(d.id)?.openPopup();
  }

  private popup(d: MapDevice) {
    const geo =
      d.withinGeofence === true
        ? `<span style="color:${COLORS.ok}">On farm</span>`
        : d.withinGeofence === false
          ? `<span style="color:${COLORS.outside}">Outside farm (${Math.round(d.distanceFromFarmMeters ?? 0)} m)</span>`
          : 'Geofence unknown';
    return `
      <div style="min-width:200px">
        <strong>${escapeHtml(d.serialNumber)}</strong><br/>
        ${escapeHtml(d.farmer?.fullName ?? 'Unassigned')} ${d.farmer ? `(${escapeHtml(d.farmer.accountNumber)})` : ''}<br/>
        ${d.farmer ? escapeHtml(d.farmer.phone) + '<br/>' : ''}
        ${geo}<br/>
        ${d.online ? 'Online' : 'Offline'} · last seen ${d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'never'}<br/>
        ${d.batteryLevel != null ? `Battery ${d.batteryLevel}% · ` : ''}${d.latitude.toFixed(6)}, ${d.longitude.toFixed(6)}<br/>
        <a href="#" class="open">Open pump →</a>
      </div>`;
  }
}
