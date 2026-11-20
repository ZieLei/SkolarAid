import { Component, input, output } from '@angular/core';

/** Generic dialog shell (WinForms ShowDialog replacement). */
@Component({
  selector: 'app-modal',
  template: `
    <div class="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" (click)="closed.emit()" (keydown.escape)="closed.emit()">
      <div class="flex max-h-[92vh] w-full flex-col rounded-xl bg-white shadow-2xl" [style.max-width.px]="width()" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
        <div class="flex items-center border-b border-[#e6e6e6] px-5 py-3">
          <h2 class="text-[16pt] font-bold text-brand">{{ title() }}</h2>
          <button class="ml-auto text-[22px] leading-none text-muted hover:text-black" aria-label="Close" (click)="closed.emit()">×</button>
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
