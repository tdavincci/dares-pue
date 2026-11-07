import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { AuthService, errorMessage } from '../core/auth';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="wrap">
      <mat-card class="card" appearance="outlined">
        @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
        <mat-card-content>
          <div class="brand">
            <mat-icon class="logo">water_pump</mat-icon>
            <h1>DARES PUE Pump Tracker</h1>
            <p>Sign in to the administration portal</p>
          </div>
          <form [formGroup]="form" (ngSubmit)="submit()">
            <mat-form-field class="full">
              <mat-label>Email</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="username" />
            </mat-form-field>
            <mat-form-field class="full">
              <mat-label>Password</mat-label>
              <input matInput [type]="hide() ? 'password' : 'text'" formControlName="password" autocomplete="current-password" />
              <button mat-icon-button matSuffix type="button" (click)="hide.set(!hide())" aria-label="Toggle password">
                <mat-icon>{{ hide() ? 'visibility' : 'visibility_off' }}</mat-icon>
              </button>
            </mat-form-field>
            @if (error()) { <div class="error">{{ error() }}</div> }
            <button mat-flat-button class="full submit" [disabled]="form.invalid || loading()">Sign in</button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 16px; background: linear-gradient(160deg, var(--mat-sys-primary-container), var(--mat-sys-surface) 60%); }
    .card { width: 100%; max-width: 400px; overflow: hidden; }
    .brand { text-align: center; margin: 16px 0 24px; }
    .logo { font-size: 48px; width: 48px; height: 48px; color: var(--mat-sys-primary); }
    h1 { font: var(--mat-sys-headline-small); margin: 8px 0 4px; }
    p { margin: 0; color: var(--mat-sys-on-surface-variant); }
    .full { width: 100%; margin-bottom: 12px; }
    .submit { height: 44px; }
    .error { color: var(--mat-sys-error); margin-bottom: 12px; }
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  hide = signal(true);
  loading = signal(false);
  error = signal('');

  submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => void this.router.navigate(['/dashboard']),
      error: (e) => {
        this.error.set(errorMessage(e));
        this.loading.set(false);
      },
    });
  }
}
