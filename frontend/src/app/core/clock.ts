import { DestroyRef, inject, Injectable, signal } from '@angular/core';

/** How often relative times ("20s ago", "5 min ago") are refreshed. */
export const CLOCK_TICK_MS = 10_000;

/**
 * One app-wide clock for relative times. A single timer updates the `now` signal every CLOCK_TICK_MS, and
 * anything that reads it in a template (e.g. the `ago` pipe) re-renders on its own. The timer stops while the
 * tab is hidden and the clock jumps to the current time as soon as the tab is shown again.
 */
@Injectable({ providedIn: 'root' })
export class Clock {
  private readonly _now = signal(Date.now());
  readonly now = this._now.asReadonly();
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    const onVisibility = () => (document.hidden ? this.stop() : this.start());
    document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      this.stop();
      document.removeEventListener('visibilitychange', onVisibility);
    });
    if (!document.hidden) this.start();
  }

  private start() {
    this._now.set(Date.now());
    if (!this.timer) this.timer = setInterval(() => this._now.set(Date.now()), CLOCK_TICK_MS);
  }

  private stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
