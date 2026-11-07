import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../core/auth';
import { ChangePasswordDialog } from '../pages/users';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  admin?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
  ],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav #sidenav [mode]="isHandset() ? 'over' : 'side'" [opened]="!isHandset()" class="nav">
        <div class="brand">
          <mat-icon class="brand-icon">water_pump</mat-icon>
          <div>
            <div class="brand-title">DARES PUE</div>
            <div class="brand-sub">Pump Tracker</div>
          </div>
        </div>
        <mat-nav-list>
          @for (item of nav; track item.path) {
            @if (!item.admin || auth.isAdmin()) {
              <a mat-list-item [routerLink]="item.path" routerLinkActive="active" #rla="routerLinkActive"
                 [activated]="rla.isActive" (click)="isHandset() && sidenav.close()">
                <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                <span matListItemTitle>{{ item.label }}</span>
              </a>
            }
          }
        </mat-nav-list>
      </mat-sidenav>
      <mat-sidenav-content>
        <mat-toolbar class="topbar">
          @if (isHandset()) {
            <button mat-icon-button (click)="sidenav.toggle()" aria-label="Menu"><mat-icon>menu</mat-icon></button>
          }
          <span class="spacer"></span>
          <button mat-button [matMenuTriggerFor]="userMenu">
            <mat-icon>account_circle</mat-icon>
            {{ auth.user()?.fullName }}
          </button>
          <mat-menu #userMenu="matMenu">
            <div class="menu-meta">{{ auth.user()?.email }} · {{ auth.user()?.role }}</div>
            <button mat-menu-item (click)="changePassword()"><mat-icon>key</mat-icon>Change password</button>
            <button mat-menu-item (click)="auth.logout()"><mat-icon>logout</mat-icon>Sign out</button>
          </mat-menu>
        </mat-toolbar>
        <main class="content"><router-outlet /></main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .shell { height: 100vh; }
    .nav { width: 248px; border-right: 1px solid var(--mat-sys-outline-variant); }
    .brand { display: flex; gap: 12px; align-items: center; padding: 20px 16px 12px; }
    .brand-icon { font-size: 36px; width: 36px; height: 36px; color: var(--mat-sys-primary); }
    .brand-title { font: var(--mat-sys-title-medium); font-weight: 600; }
    .brand-sub { font: var(--mat-sys-label-small); color: var(--mat-sys-on-surface-variant); }
    .topbar { position: sticky; top: 0; z-index: 2; background: var(--mat-sys-surface); border-bottom: 1px solid var(--mat-sys-outline-variant); }
    .spacer { flex: 1; }
    .content { padding: 24px; max-width: 1400px; margin: 0 auto; }
    .menu-meta { padding: 8px 16px; font: var(--mat-sys-label-small); color: var(--mat-sys-on-surface-variant); }
    @media (max-width: 600px) { .content { padding: 16px; } }
  `,
})
export class Shell {
  auth = inject(AuthService);
  private dialog = inject(MatDialog);
  isHandset = toSignal(
    inject(BreakpointObserver).observe('(max-width: 959px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  nav: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/map', label: 'Live map', icon: 'map' },
    { path: '/devices', label: 'Pumps & trackers', icon: 'water_pump' },
    { path: '/farmers', label: 'Farmers', icon: 'agriculture' },
    { path: '/payments', label: 'Payments', icon: 'payments' },
    { path: '/api-clients', label: 'API access', icon: 'vpn_key', admin: true },
    { path: '/users', label: 'Users', icon: 'group', admin: true },
  ];

  changePassword() {
    this.dialog.open(ChangePasswordDialog, { width: '420px' });
  }
}
