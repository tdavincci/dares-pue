import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, tap, throwError } from 'rxjs';
import { API_BASE } from './api.service';
import { User, UserRole } from './models';

const TOKEN_KEY = 'dpue.token';
const USER_KEY = 'dpue.user';

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly token = signal<string | null>(read<string>(TOKEN_KEY));
  readonly user = signal<User | null>(read<User>(USER_KEY));
  readonly isLoggedIn = computed(() => !!this.token());
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  readonly canEdit = computed(() => ['ADMIN', 'OPERATOR'].includes(this.user()?.role ?? ''));

  hasRole(...roles: UserRole[]) {
    const r = this.user()?.role;
    return r === 'ADMIN' || (!!r && roles.includes(r));
  }

  login(email: string, password: string) {
    return this.http.post<{ accessToken: string; user: User }>(`${API_BASE}/auth/login`, { email, password }).pipe(
      tap((res) => {
        this.token.set(res.accessToken);
        this.user.set(res.user);
        try {
          localStorage.setItem(TOKEN_KEY, JSON.stringify(res.accessToken));
          localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        } catch {
          /* storage unavailable: session-only login */
        }
      }),
    );
  }

  logout(redirect = true) {
    this.token.set(null);
    this.user.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
    if (redirect) void this.router.navigate(['/login']);
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const isApi = req.url.startsWith(API_BASE) && !req.url.endsWith('/auth/login');
  const authReq = token && isApi ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && isApi) auth.logout();
      return throwError(() => err);
    }),
  );
};

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? true : inject(Router).createUrlTree(['/login']);
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAdmin() ? true : inject(Router).createUrlTree(['/dashboard']);
};

/** Pulls a human-readable message out of a NestJS error response. */
export function errorMessage(err: unknown): string {
  const e = err as HttpErrorResponse;
  const m = e?.error?.message;
  if (Array.isArray(m)) return m.join('; ');
  if (typeof m === 'string') return m;
  if (e?.status === 0) return 'Cannot reach the server';
  return e?.message ?? 'Something went wrong';
}
