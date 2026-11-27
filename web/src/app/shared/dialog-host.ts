// =====================================================================
// dialog-host.ts - draws the pop-up box that DialogService (core/dialog.ts)
// asks for. Placed once in app.ts, so any page can open a dialog.
// =====================================================================
import { Component, inject } from '@angular/core';
import { DialogService } from '../core/dialog';

@Component({
  selector: 'app-dialog-host',
  template: `
    @if (dlg.current(); as d) {
      <div
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
        (keydown.escape)="dlg.close(false)"
      >
        <div
          class="w-full max-w-[460px] rounded-xl bg-white p-6 shadow-2xl"
          role="dialog"
          aria-modal="true"
        >
          <h2
            class="mb-2 text-[18px] font-bold"
            [style.color]="
              d.kind === 'error'
                ? '#b42318'
                : d.kind === 'warning'
                  ? '#8a5300'
                  : d.kind === 'success'
                    ? '#17692c'
                    : '#00444f'
            "
          >
            {{ d.title }}
          </h2>
          <p class="mb-5 max-h-[50vh] overflow-auto whitespace-pre-line text-[14px] text-[#333]">
            {{ d.message }}
          </p>
          <div class="flex justify-end gap-2">
            @if (d.kind === 'confirm') {
              <button class="btn btn-gray" (click)="dlg.close(false)">{{ d.cancelText }}</button>
            }
            <button
              class="btn"
              [class.btn-danger]="d.kind === 'error' || d.danger"
              [class.btn-brand]="d.kind !== 'error' && !d.danger"
              (click)="dlg.close(true)"
            >
              {{ d.confirmText }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class DialogHost {
  dlg = inject(DialogService);
}
