import { Clipboard } from '@angular/cdk/clipboard';
import { Component, computed, inject, input, Pipe, PipeTransform } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Clock } from '../core/clock';

/**
 * "3 min ago" style relative time that keeps itself current: it reads the shared Clock (ticks every 10 s), so
 * the text updates without reloading the page. Impure so it re-runs when the clock ticks; it's cheap arithmetic.
 */
@Pipe({ name: 'ago', pure: false })
export class AgoPipe implements PipeTransform {
  private clock = inject(Clock);

  transform(value: string | Date | null | undefined): string {
    const now = this.clock.now(); // read first, so the template re-renders on every tick
    if (!value) return 'never';
    const s = Math.floor((now - new Date(value).getTime()) / 1000);
    if (s < 10) return 'just now';
    // Whole 10 s steps, in line with the clock, so the number doesn't look stuck between ticks.
    if (s < 60) return `${Math.floor(s / 10) * 10}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
  }
}

@Pipe({ name: 'distance' })
export class DistancePipe implements PipeTransform {
  transform(m: number | null | undefined): string {
    if (m === null || m === undefined) return '—';
    return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
  }
}

@Pipe({ name: 'label' })
export class LabelPipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    if (!v) return '';
    return v
      .toLowerCase()
      .split('_')
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ');
  }
}

@Pipe({ name: 'join' })
export class JoinPipe implements PipeTransform {
  transform(parts: (string | null | undefined)[], sep = ', '): string {
    return parts.filter((p) => !!p).join(sep) || '—';
  }
}

/** Small coloured status pill. */
@Component({
  selector: 'app-pill',
  template: `<span class="pill" [class]="'pill ' + tone()">{{ text() }}</span>`,
  styles: `
    .pill { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 999px; font: var(--mat-sys-label-small); font-weight: 600; letter-spacing: .02em; white-space: nowrap; }
    .good { background: #dcf3e3; color: #0f5b2c; }
    .warn { background: #fff1d6; color: #7a4b00; }
    .bad { background: #fde1df; color: #8c1d18; }
    .info { background: #dde9ff; color: #0b3d91; }
    .muted { background: var(--mat-sys-surface-container-high); color: var(--mat-sys-on-surface-variant); }
  `,
})
export class Pill {
  text = input.required<string>();
  tone = input<'good' | 'warn' | 'bad' | 'info' | 'muted'>('muted');
}

@Component({
  selector: 'app-device-status',
  imports: [Pill, LabelPipe],
  template: `<app-pill [text]="status() | label" [tone]="tone()" />`,
})
export class DeviceStatusPill {
  status = input.required<string>();
  tone = computed(() =>
    ({ ACTIVE: 'good', REGISTERED: 'info', SUSPENDED: 'warn', DECOMMISSIONED: 'muted' } as const)[
      this.status() as 'ACTIVE'
    ] ?? 'muted',
  );
}

@Component({
  selector: 'app-geofence',
  imports: [Pill, MatTooltipModule, DistancePipe],
  template: `
    @if (within() === true) {
      <app-pill text="On farm" tone="good" [matTooltip]="(distance() | distance) + ' from farm point'" />
    } @else if (within() === false) {
      <app-pill text="Outside farm" tone="bad" [matTooltip]="(distance() | distance) + ' from farm point'" />
    } @else {
      <app-pill text="Unknown" tone="muted" matTooltip="No fix yet, or farm location not set" />
    }
  `,
})
export class GeofencePill {
  within = input<boolean | null>(null);
  distance = input<number | null>(null);
}

@Component({
  selector: 'app-payment-status',
  imports: [Pill],
  template: `<app-pill [text]="text()" [tone]="tone()" />`,
})
export class PaymentStatusPill {
  status = input<string | undefined>();
  text = computed(() => ({ PAID: 'Paid', PARTIAL: 'Part paid', UNPAID: 'Not paid', UNASSIGNED: 'In stock' })[this.status() as 'PAID'] ?? '—');
  tone = computed(() => ({ PAID: 'good', PARTIAL: 'warn', UNPAID: 'bad', UNASSIGNED: 'muted' } as const)[this.status() as 'PAID'] ?? 'muted');
}

@Component({
  selector: 'app-online',
  imports: [Pill],
  template: `<app-pill [text]="online() ? 'Online' : 'Offline'" [tone]="online() ? 'good' : 'warn'" />`,
})
export class OnlinePill {
  online = input(false);
}

export interface SecretDialogData {
  title: string;
  message: string;
  secrets: { label: string; value: string }[];
}

/** Shows a secret exactly once with copy buttons. */
@Component({
  selector: 'app-secret-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, FormsModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="warn"><mat-icon>warning</mat-icon> {{ data.message }}</p>
      @for (s of data.secrets; track s.label) {
        <mat-form-field class="full">
          <mat-label>{{ s.label }}</mat-label>
          <input matInput [value]="s.value" readonly class="mono" />
          <button mat-icon-button matSuffix (click)="copy(s.value)" aria-label="Copy"><mat-icon>content_copy</mat-icon></button>
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-flat-button mat-dialog-close>I've saved it</button></mat-dialog-actions>
  `,
  styles: `
    .warn { display: flex; gap: 8px; align-items: flex-start; color: #7a4b00; background: #fff1d6; padding: 12px; border-radius: 8px; }
    .full { width: 100%; margin-top: 12px; }
    .mono { font-family: ui-monospace, monospace; font-size: 13px; }
  `,
})
export class SecretDialog {
  data = inject<SecretDialogData>(MAT_DIALOG_DATA);
  private clipboard = inject(Clipboard);
  copy(v: string) {
    this.clipboard.copy(v);
  }
}

export interface ConfirmData {
  title: string;
  message: string;
  confirm?: string;
  input?: string;
}

@Component({
  selector: 'app-confirm',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, FormsModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      @if (data.input) {
        <mat-form-field style="width:100%"><mat-label>{{ data.input }}</mat-label><input matInput [(ngModel)]="value" /></mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [mat-dialog-close]="data.input ? value : true" [disabled]="!!data.input && value.trim().length < 3">
        {{ data.confirm ?? 'Confirm' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialog {
  data = inject<ConfirmData>(MAT_DIALOG_DATA);
  value = '';
}
