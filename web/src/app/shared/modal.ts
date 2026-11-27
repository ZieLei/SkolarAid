// =====================================================================
// modal.ts - a reusable pop-up window. Put your form inside it:
// <app-modal title="Edit" (closed)="open.set(false)"> ...content... </app-modal>
//
// On phones (narrower than 640 px), big pop-ups (width >= 600, i.e. forms)
// fill the whole screen like a separate page; small ones (confirmations)
// stay a centred card. While any pop-up is open the page behind it cannot
// scroll, so scrolling the form never "leaks" into the page underneath.
// =====================================================================
import { Component, OnDestroy, computed, input, output } from '@angular/core';

// How many pop-ups are open (they can be stacked), so the page is unlocked only when the last one closes.
let openCount = 0;
let savedOverflow = '';

/** Generic dialog shell (WinForms ShowDialog replacement). */
@Component({
  selector: 'app-modal',
  template: `
    <div
      class="fixed inset-0 z-[90] flex items-center justify-center bg-[#06242a]/50 backdrop-blur-sm overscroll-contain"
      [class]="full() ? 'p-0 sm:p-4' : 'p-3 sm:p-4'"
      (click)="closed.emit()"
      (keydown.escape)="closed.emit()"
    >
      <div
        class="flex w-full flex-col bg-white shadow-2xl ring-1 ring-black/5"
        [class]="
          full()
            ? 'h-[100dvh] max-h-[100dvh] rounded-none sm:h-auto sm:max-h-[92vh] sm:rounded-2xl'
            : 'max-h-[92dvh] rounded-2xl sm:max-h-[92vh]'
        "
        [style.max-width.px]="width()"
        (click)="$event.stopPropagation()"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex shrink-0 items-center border-b border-line px-5 py-3 sm:px-6 sm:py-4">
          <h2 class="min-w-0 truncate text-[18px] font-semibold tracking-tight text-ink">
            {{ title() }}
          </h2>
          <button
            class="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[26px] leading-none text-muted hover:bg-brand-soft hover:text-black sm:h-8 sm:w-8 sm:text-[22px]"
            aria-label="Close"
            (click)="closed.emit()"
          >
            ×
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5"><ng-content /></div>
      </div>
    </div>
  `,
})
export class Modal implements OnDestroy {
  title = input.required<string>();
  width = input(640);
  closed = output<void>();
  /** Forms fill the screen on phones; small confirmation boxes stay cards. */
  full = computed(() => this.width() >= 600);

  constructor() {
    if (openCount++ === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
  }

  ngOnDestroy(): void {
    if (--openCount === 0) document.body.style.overflow = savedOverflow;
  }
}
