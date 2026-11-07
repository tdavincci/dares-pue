import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { errorMessage } from './auth';

@Injectable({ providedIn: 'root' })
export class Notify {
  private snack = inject(MatSnackBar);

  ok(message: string) {
    this.snack.open(message, 'OK', { duration: 3500 });
  }

  error(err: unknown) {
    this.snack.open(errorMessage(err), 'Dismiss', { duration: 7000, panelClass: 'snack-error' });
  }
}
