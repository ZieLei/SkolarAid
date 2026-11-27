// =====================================================================
// suggest-input.ts - a text box with a suggestion list under it.
//
// <app-suggest-input inputId="sf-st" [options]="opts" [(value)]="name" newLabel="scholarship type" />
//
// - Tap / focus the box: every option is listed. Typing filters it (matches
//   anywhere in the name, ignoring upper/lower case); the closest matches
//   come first: exact name, then names starting with the text, then the rest.
// - Pick an option with a tap, or Arrow keys + Enter.
// - Anything else can be typed freely: the list then ends with
//   'Add "<text>" as a new …' so it is clear a new entry will be made.
// Replaces <datalist>, which phones show badly or not at all.
// =====================================================================
import { Component, computed, input, model, signal } from '@angular/core';

export interface SuggestOption { value: string; hint?: string; }

let nextId = 0;

@Component({
  selector: 'app-suggest-input',
  host: { class: 'relative block' },
  template: `
    <input [id]="inputId()" class="input" type="text" autocomplete="off" [attr.maxlength]="maxLength()" [placeholder]="placeholder()"
           [class.input-invalid]="invalid()" [attr.aria-invalid]="invalid()"
           role="combobox" aria-autocomplete="list" [attr.aria-expanded]="open()" [attr.aria-controls]="listId"
           [attr.aria-activedescendant]="open() && active() >= 0 ? listId + '-' + active() : null"
           [value]="value()" (input)="type($any($event.target).value)" (focus)="openAll()" (click)="openAll()"
           (blur)="open.set(false)" (keydown)="key($event)" />
    @if (open() && (shown().length || newText())) {
      <ul [id]="listId" role="listbox" class="absolute left-0 right-0 top-full z-20 mt-1 max-h-[260px] overflow-y-auto overscroll-contain rounded-xl border border-[#d3dcdf] bg-white py-1 shadow-lg">
        @for (o of shown(); track o.value; let i = $index) {
          <!-- mousedown + preventDefault: pick before the box loses focus (otherwise the list closes first). -->
          <li [id]="listId + '-' + i" role="option" [attr.aria-selected]="i === active()"
              class="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 text-[14px] lg:min-h-[36px]"
              [class.bg-brand-soft]="i === active()" (mousedown)="$event.preventDefault(); pick(o.value)" (mouseenter)="active.set(i)">
            <span class="min-w-0 flex-1 truncate" [class.font-semibold]="o.value.toLowerCase() === value().trim().toLowerCase()">{{ o.value }}</span>
            @if (o.hint) { <span class="shrink-0 text-[12px] text-muted">{{ o.hint }}</span> }
          </li>
        }
        @if (newText(); as t) {
          <li [id]="listId + '-' + shown().length" role="option" [attr.aria-selected]="active() === shown().length"
              class="flex min-h-[44px] cursor-pointer items-center gap-2 border-t border-line px-3 py-2 text-[14px] text-[#8a5300] lg:min-h-[36px]"
              [class.bg-brand-soft]="active() === shown().length" (mousedown)="$event.preventDefault(); pick(t)" (mouseenter)="active.set(shown().length)">
            <span class="text-[16px] leading-none">+</span><span class="min-w-0 break-words">Add “<b>{{ t }}</b>” as a new {{ newLabel() }}</span>
          </li>
        }
      </ul>
    }
  `,
})
export class SuggestInput {
  options = input<SuggestOption[]>([]);
  value = model('');
  inputId = input('');
  placeholder = input('');
  maxLength = input<number | null>(null);
  invalid = input(false);
  /** Word used in the 'Add "…" as a new …' row. */
  newLabel = input('entry');

  readonly listId = `suggest-${nextId++}`;
  open = signal(false);
  active = signal(-1);
  /** What the user typed since the list opened ('' = nothing yet, so show every option). */
  private query = signal('');

  private exact = computed(() => {
    const t = this.value().trim().toLowerCase();
    return !!t && this.options().some((o) => o.value.toLowerCase() === t);
  });
  /** Options to list: all of them until the user types, then those containing the text, best matches first. */
  shown = computed(() => {
    const t = this.query().trim().toLowerCase();
    if (!t) return this.options();
    const rank = (v: string) => (v === t ? 0 : v.startsWith(t) ? 1 : 2);
    return this.options()
      .filter((o) => o.value.toLowerCase().includes(t))
      .sort((a, b) => rank(a.value.toLowerCase()) - rank(b.value.toLowerCase()));
  });
  /** The typed text when it is not an existing option (offered as a new entry). */
  newText = computed(() => (this.value().trim() && !this.exact() ? this.value().trim() : ''));

  openAll(): void { if (!this.open()) { this.query.set(''); this.active.set(-1); this.open.set(true); } }

  type(v: string): void { this.value.set(v); this.query.set(v); this.open.set(true); this.active.set(-1); }

  pick(v: string): void { this.value.set(v); this.query.set(''); this.open.set(false); this.active.set(-1); }

  key(e: KeyboardEvent): void {
    const count = this.shown().length + (this.newText() ? 1 : 0);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!this.open()) { this.openAll(); return; }
      if (!count) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      this.active.set((this.active() + step + count) % count);
    } else if (e.key === 'Enter' && this.open() && this.active() >= 0) {
      e.preventDefault();
      const i = this.active();
      this.pick(i < this.shown().length ? this.shown()[i].value : this.newText());
    } else if (e.key === 'Escape' && this.open()) {
      e.stopPropagation(); // close the list, not the whole pop-up
      this.open.set(false);
    }
  }
}
