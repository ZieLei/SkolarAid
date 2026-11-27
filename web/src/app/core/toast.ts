// =====================================================================
// toast.ts - a small message at the bottom of the screen that goes
// away by itself after 6 seconds. Shown by shared/toast-host.ts.
// Example: this.toast.show('Deleted', { actionLabel: 'Undo', onAction: () => ... })
// =====================================================================
import { Injectable, signal } from '@angular/core';

export interface ToastState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Small non-blocking message with an optional action (used for "Undo"). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly current = signal<ToastState | null>(null);
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  // Show a new toast (replaces the old one) and start the hide timer.
  show(
    message: string,
    opts: { actionLabel?: string; onAction?: () => void; durationMs?: number } = {},
  ): void {
    clearTimeout(this.timer);
    const id = ++this.seq;
    this.current.set({ id, message, actionLabel: opts.actionLabel, onAction: opts.onAction });
    this.timer = setTimeout(() => this.dismiss(id), opts.durationMs ?? 6000);
  }
  dismiss(id?: number): void {
    if (id === undefined || this.current()?.id === id) this.current.set(null);
  }
  // The user clicked the action button (e.g. "Undo").
  act(): void {
    const c = this.current();
    this.current.set(null);
    c?.onAction?.();
  }
}
