import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { ApiService } from '../core/api.service';
import { User } from '../core/models';
import { Notify } from '../core/notify';
import { AgoPipe, LabelPipe } from '../shared/ui';

@Component({
  selector: 'app-user-form',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.user ? 'Edit ' + data.user.fullName : 'Add user' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="col">
        <mat-form-field><mat-label>Full name</mat-label><input matInput formControlName="fullName" /></mat-form-field>
        @if (!data.user) { <mat-form-field><mat-label>Email</mat-label><input matInput type="email" formControlName="email" /></mat-form-field> }
        <mat-form-field><mat-label>Role</mat-label>
          <mat-select formControlName="role">
            <mat-option value="ADMIN">Admin — everything incl. users & API access</mat-option>
            <mat-option value="OPERATOR">Operator — register farmers, pumps, payments</mat-option>
            <mat-option value="VIEWER">Viewer — read only</mat-option>
          </mat-select></mat-form-field>
        <mat-form-field><mat-label>{{ data.user ? 'New password (optional)' : 'Password' }}</mat-label>
          <input matInput type="password" formControlName="password" autocomplete="new-password" />
          <mat-hint>At least 8 characters</mat-hint></mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">Save</button>
    </mat-dialog-actions>
  `,
  styles: `.col { display: flex; flex-direction: column; gap: 12px; padding-top: 8px; }`,
})
export class UserFormDialog {
  data = inject<{ user?: User }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<UserFormDialog>);
  private api = inject(ApiService);
  private notify = inject(Notify);
  form = inject(FormBuilder).nonNullable.group({
    fullName: [this.data.user?.fullName ?? '', Validators.required],
    email: [this.data.user?.email ?? '', this.data.user ? [] : [Validators.required, Validators.email]],
    role: [this.data.user?.role ?? 'OPERATOR'],
    password: ['', this.data.user ? [Validators.minLength(8)] : [Validators.required, Validators.minLength(8)]],
  });

  save() {
    const v = this.form.getRawValue();
    const req = this.data.user
      ? this.api.updateUser(this.data.user.id, { fullName: v.fullName, role: v.role, ...(v.password ? { password: v.password } : {}) })
      : this.api.createUser(v);
    req.subscribe({ next: (u) => this.ref.close(u), error: (e) => this.notify.error(e) });
  }
}

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Change password</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="col">
        <mat-form-field><mat-label>Current password</mat-label><input matInput type="password" formControlName="current" autocomplete="current-password" /></mat-form-field>
        <mat-form-field><mat-label>New password</mat-label><input matInput type="password" formControlName="next" autocomplete="new-password" />
          <mat-hint>At least 8 characters</mat-hint></mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">Change</button>
    </mat-dialog-actions>
  `,
  styles: `.col { display: flex; flex-direction: column; gap: 12px; padding-top: 8px; }`,
})
export class ChangePasswordDialog {
  private ref = inject(MatDialogRef<ChangePasswordDialog>);
  private api = inject(ApiService);
  private notify = inject(Notify);
  form = inject(FormBuilder).nonNullable.group({
    current: ['', Validators.required],
    next: ['', [Validators.required, Validators.minLength(8)]],
  });

  save() {
    const v = this.form.getRawValue();
    this.api.changePassword(v.current, v.next).subscribe({
      next: () => {
        this.notify.ok('Password changed');
        this.ref.close();
      },
      error: (e) => this.notify.error(e),
    });
  }
}

@Component({
  selector: 'app-users',
  imports: [DatePipe, MatTableModule, MatButtonModule, MatIconModule, MatSlideToggleModule, AgoPipe, LabelPipe],
  template: `
    <div class="head">
      <h1>Users</h1>
      <button mat-flat-button (click)="open()"><mat-icon>person_add</mat-icon>Add user</button>
    </div>
    <div class="table-wrap">
      <table mat-table [dataSource]="users()">
        <ng-container matColumnDef="name"><th mat-header-cell *matHeaderCellDef>Name</th>
          <td mat-cell *matCellDef="let u"><div>{{ u.fullName }}</div><div class="muted">{{ u.email }}</div></td></ng-container>
        <ng-container matColumnDef="role"><th mat-header-cell *matHeaderCellDef>Role</th>
          <td mat-cell *matCellDef="let u">{{ u.role | label }}</td></ng-container>
        <ng-container matColumnDef="login"><th mat-header-cell *matHeaderCellDef>Last login</th>
          <td mat-cell *matCellDef="let u">{{ u.lastLoginAt | ago }}</td></ng-container>
        <ng-container matColumnDef="created"><th mat-header-cell *matHeaderCellDef>Created</th>
          <td mat-cell *matCellDef="let u">{{ u.createdAt | date: 'mediumDate' }}</td></ng-container>
        <ng-container matColumnDef="active"><th mat-header-cell *matHeaderCellDef>Active</th>
          <td mat-cell *matCellDef="let u"><mat-slide-toggle [checked]="u.isActive" (change)="setActive(u, $event.checked)" /></td></ng-container>
        <ng-container matColumnDef="act"><th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let u"><button mat-icon-button (click)="open(u)" aria-label="Edit"><mat-icon>edit</mat-icon></button></td></ng-container>
        <tr mat-header-row *matHeaderRowDef="cols"></tr>
        <tr mat-row *matRowDef="let row; columns: cols"></tr>
      </table>
    </div>
  `,
  styles: `
    .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    h1 { font: var(--mat-sys-headline-small); margin: 0; }
    .table-wrap { border: 1px solid var(--mat-sys-outline-variant); border-radius: 16px; overflow: auto; }
    table { width: 100%; }
    .muted { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
  `,
})
export class UsersPage implements OnInit {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private notify = inject(Notify);
  users = signal<User[]>([]);
  cols = ['name', 'role', 'login', 'created', 'active', 'act'];

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.users().subscribe({ next: (u) => this.users.set(u), error: (e) => this.notify.error(e) });
  }

  open(user?: User) {
    this.dialog
      .open(UserFormDialog, { width: '480px', data: { user } })
      .afterClosed()
      .subscribe((u) => u && this.load());
  }

  setActive(u: User, isActive: boolean) {
    this.api.updateUser(u.id, { isActive }).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) });
  }
}
