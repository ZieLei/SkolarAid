// =====================================================================
// toast-host.ts - draws the toast message from ToastService (core/toast.ts).
// Placed once in app.ts.
// =====================================================================
import { Component, inject } from '@angular/core';
import { ToastService } from '../core/toast';

@Component({
  selector: 'app-toast-host',
  template: `
    @if (toast.current(); as t) {
      <div
        class="fixed bottom-5 left-1/2 z-[90] flex max-w-[92vw] -translate-x-1/2 items-center gap-4 rounded-2xl bg-[#0f2a30]/95 px-5 py-3 backdrop-blur ring-1 ring-white/10 text-[14px] text-white shadow-xl"
        role="status"
        aria-live="polite"
      >
        <span>{{ t.message }}</span>
        @if (t.actionLabel) {
          <button
            class="rounded-full border border-white/40 px-3 py-1 font-semibold hover:bg-white/15"
            (click)="toast.act()"
          >
            {{ t.actionLabel }}
          </button>
        }
        <button
          class="px-1 text-[18px] leading-none text-white/80 hover:text-white"
          (click)="toast.dismiss()"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    }
  `,
})
export class ToastHost {
  toast = inject(ToastService);
}
