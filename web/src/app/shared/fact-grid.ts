// =====================================================================
// fact-grid.ts - a small grid of "icon + label + value" tiles.
// Usage: <app-fact-grid [facts]="[{ icon: 'user', label: 'Name', value: 'Ana' }]" />
// =====================================================================
import { Component, input } from '@angular/core';
import { AppIcon } from './icon';

export interface Fact {
  icon: string;
  label: string;
  value: string;
  tone?: 'ok' | 'pending' | 'strong';
}

/** Icon + label + value tiles for dialogs (replaces emoji-prefixed text lines). */
@Component({
  selector: 'app-fact-grid',
  imports: [AppIcon],
  template: `
    <dl class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
      @for (f of facts(); track f.label) {
        <div class="flex items-center gap-3 rounded-lg bg-[#f0f7f8] px-3 py-2">
          <app-icon
            [name]="f.icon"
            class="h-[34px] w-[34px] shrink-0 rounded-lg bg-brand p-[7px] text-white"
          ></app-icon>
          <div class="min-w-0">
            <dt class="text-[12px] text-[#4b5563]">{{ f.label }}</dt>
            <dd
              class="truncate font-bold"
              [class.text-[18px]]="f.tone === 'strong'"
              [class.text-[15px]]="f.tone !== 'strong'"
              [class.text-ok]="f.tone === 'ok'"
              [class.text-pending]="f.tone === 'pending'"
              [class.text-brand]="!f.tone || f.tone === 'strong'"
            >
              {{ f.value }}
            </dd>
          </div>
        </div>
      }
    </dl>
  `,
})
export class FactGrid {
  facts = input.required<readonly Fact[]>();
}
