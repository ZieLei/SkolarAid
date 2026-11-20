import { Component, input, output } from '@angular/core';
import { signal } from '@angular/core';
import { AppIcon } from './icon';

export interface FieldError { id: string; message: string; }

/** Tracks inline validation errors keyed by the id of the input they belong to. */
export class FormErrors {
  readonly list = signal<FieldError[]>([]);
  /** Becomes true after the first failed submit; from then on errors are re-checked as the user types. */
  attempted = false;
  set(errors: FieldError[]): void { this.list.set(errors); }
  clear(): void { this.attempted = false; this.list.set([]); }
  get(id: string): string | null { return this.list().find((e) => e.id === id)?.message ?? null; }
  has(id: string): boolean { return this.get(id) !== null; }
}

/** Moves focus to the first invalid field (without scrolling past the summary that sits above it). */
export function focusField(id: string, root: ParentNode = document): void {
  const el = root.querySelector<HTMLElement>('#' + CSS.escape(id));
  el?.focus({ preventScroll: true });
}

/** GOV.UK-style error summary: lists every problem and links to the field. */
@Component({
  selector: 'app-error-summary',
  imports: [AppIcon],
  template: `
    @if (errors().length) {
      <div class="rounded-lg border-2 border-[#b42318] bg-[#fdecea] px-4 py-3" role="alert" tabindex="-1" id="error-summary">
        <p class="mb-1 flex items-center gap-2 text-[15px] font-bold text-[#8c1d13]"><app-icon name="alert" class="h-5 w-5"></app-icon>
          {{ errors().length === 1 ? 'There is 1 problem' : 'There are ' + errors().length + ' problems' }} to fix before you can continue</p>
        <ul class="list-disc pl-6 text-[14px]">
          @for (e of errors(); track e.id) { <li><a href="javascript:void(0)" class="text-[#8c1d13] underline" (click)="pick.emit(e.id)">{{ e.message }}</a></li> }
        </ul>
      </div>
    }
  `,
})
export class ErrorSummary {
  errors = input.required<readonly FieldError[]>();
  pick = output<string>();
}
