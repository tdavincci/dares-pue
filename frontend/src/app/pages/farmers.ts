import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { debounceTime, Subject } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth';
import { Farmer } from '../core/models';
import { Notify } from '../core/notify';
import { JoinPipe, Pill } from '../shared/ui';
import { FarmerFormDialog } from './farmer-form';

@Component({
  selector: 'app-farmers',
  imports: [FormsModule, MatTableModule, MatPaginatorModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressBarModule, Pill, JoinPipe],
  template: `
    <div class="head">
      <h1>Farmers</h1>
      @if (auth.canEdit()) { <button mat-flat-button (click)="create()"><mat-icon>person_add</mat-icon>Register farmer</button> }
    </div>
    <mat-form-field class="search"><mat-label>Search</mat-label><mat-icon matPrefix>search</mat-icon>
      <input matInput [(ngModel)]="search" (ngModelChange)="search$.next()" placeholder="Name, phone, account, community, farm" /></mat-form-field>
    <div class="table-wrap">
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      <table mat-table [dataSource]="rows()">
        <ng-container matColumnDef="acct"><th mat-header-cell *matHeaderCellDef>Account</th>
          <td mat-cell *matCellDef="let f" class="mono">{{ f.accountNumber }}</td></ng-container>
        <ng-container matColumnDef="name"><th mat-header-cell *matHeaderCellDef>Name</th>
          <td mat-cell *matCellDef="let f"><div class="strong">{{ f.fullName }}</div><div class="muted">{{ f.phone }}</div></td></ng-container>
        <ng-container matColumnDef="loc"><th mat-header-cell *matHeaderCellDef>Location</th>
          <td mat-cell *matCellDef="let f">{{ [f.community, f.lga, f.state] | join }}</td></ng-container>
        <ng-container matColumnDef="farm"><th mat-header-cell *matHeaderCellDef>Farm point</th>
          <td mat-cell *matCellDef="let f">
            @if (f.farmLatitude != null) { <span class="mono">{{ f.farmLatitude.toFixed(5) }}, {{ f.farmLongitude.toFixed(5) }}</span> }
            @else { <app-pill text="Not set" tone="warn" /> }
          </td></ng-container>
        <ng-container matColumnDef="pumps"><th mat-header-cell *matHeaderCellDef>Pumps</th>
          <td mat-cell *matCellDef="let f">{{ f.deviceCount ?? 0 }}</td></ng-container>
        <tr mat-header-row *matHeaderRowDef="cols; sticky: true"></tr>
        <tr mat-row *matRowDef="let row; columns: cols" class="click" (click)="router.navigate(['/farmers', row.id])"></tr>
        <tr class="mat-row" *matNoDataRow><td class="mat-cell empty" [attr.colspan]="cols.length">No farmers found.</td></tr>
      </table>
      <mat-paginator [length]="total()" [pageSize]="pageSize" [pageIndex]="page - 1" [pageSizeOptions]="[25, 50, 100]" (page)="onPage($event)" />
    </div>
  `,
  styles: `
    .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    h1 { font: var(--mat-sys-headline-small); margin: 0; }
    .search { width: 100%; margin-bottom: 12px; }
    .table-wrap { border: 1px solid var(--mat-sys-outline-variant); border-radius: 16px; overflow: auto; }
    table { width: 100%; }
    .strong { font-weight: 500; } .muted { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
    .mono { font-family: ui-monospace, monospace; font-size: 12px; }
    .click { cursor: pointer; } .click:hover { background: var(--mat-sys-surface-container-low); }
    .empty { padding: 24px; text-align: center; color: var(--mat-sys-on-surface-variant); }
  `,
})
export class FarmersPage implements OnInit {
  auth = inject(AuthService);
  router = inject(Router);
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private notify = inject(Notify);
  cols = ['acct', 'name', 'loc', 'farm', 'pumps'];
  rows = signal<Farmer[]>([]);
  total = signal(0);
  loading = signal(false);
  search = '';
  page = 1;
  pageSize = 25;
  search$ = new Subject<void>();

  ngOnInit() {
    this.search$.pipe(debounceTime(300)).subscribe(() => {
      this.page = 1;
      this.load();
    });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.farmers({ search: this.search, page: this.page, pageSize: this.pageSize }).subscribe({
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

  create() {
    this.dialog
      .open(FarmerFormDialog, { width: '760px', maxWidth: '96vw', data: {} })
      .afterClosed()
      .subscribe((f?: Farmer) => {
        if (!f) return;
        this.notify.ok(`${f.fullName} registered as ${f.accountNumber}`);
        void this.router.navigate(['/farmers', f.id]);
      });
  }
}
