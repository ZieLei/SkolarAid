// =====================================================================
// modal.ts - a reusable pop-up window. Put your form inside it:
// <app-modal title="Edit" (closed)="open.set(false)"> ...content... </app-modal>
// =====================================================================
import { Component, input, output } from '@angular/core';

/** Generic dialog shell (WinForms ShowDialog replacement). */
@Component({
  selector: 'app-modal',
  template: `
    <div class="fixed inset-0 z-[90] flex items-center justify-center bg-[#06242a]/50 backdrop-blur-sm p-4" (click)="closed.emit()" (keydown.escape)="closed.emit()">
      <div class="flex max-h-[92vh] w-full flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5" [style.max-width.px]="width()" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
        <div class="flex items-center border-b border-line px-6 py-4">
          <h2 class="text-[18px] font-semibold tracking-tight text-ink">{{ title() }}</h2>
          <button class="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-[22px] leading-none text-muted hover:bg-brand-soft hover:text-black" aria-label="Close" (click)="closed.emit()">×</button>
        </div>
        <div class="overflow-auto p-5"><ng-content /></div>
      </div>
    </div>
  `,
})
export class Modal {
  title = input.required<string>();
  width = input(640);
  closed = output<void>();
}
