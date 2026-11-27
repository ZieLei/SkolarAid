// =====================================================================
// stat-strip.ts - the row of number cards at the top of many pages
// (e.g. "Total 120 | Unread 4 | Read 116").
// =====================================================================
import { Component, input } from '@angular/core';

export interface StatItem {
  label: string;
  value: string | number;
  sub?: string;
  hint?: string;
  tone?: 'pending' | 'ok' | 'danger' | 'info';
  progress?: number;
  /** Smaller text for long values such as a scholarship name. */ compact?: boolean;
}

/**
 * One slim summary bar instead of a row of big cards. Zero values are shown in muted grey
 * so only numbers that need attention stand out.
 */
@Component({
  selector: 'app-stat-strip',
  template: `
    <!-- The grey background shows through 1px gaps as the dividers; 2 columns on phones, one row from tablets up. -->
    <div
      class="card grid w-full grid-cols-2 gap-px overflow-hidden bg-line md:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]"
      role="group"
      aria-label="Summary"
    >
      @for (i of items(); track i.label; let last = $last; let odd = $odd) {
        <div
          class="min-w-0 bg-white px-4 py-3 md:col-span-1 md:px-5"
          [class.col-span-2]="last && !odd"
          [attr.title]="i.hint ?? null"
        >
          <p class="text-[11px] font-semibold uppercase tracking-wider text-[#4b5563]">
            {{ i.label }}
          </p>
          <p
            class="font-bold leading-tight tracking-tight"
            [class]="i.compact ? 'text-[17px]' : 'text-[22px] md:text-[24px]'"
            [style.color]="color(i)"
          >
            {{ i.value }}
          </p>
          @if (i.progress !== undefined) {
            <div class="mt-1 h-[6px] w-full overflow-hidden rounded bg-[#e6e6e6]">
              <div class="h-full bg-ok" [style.width.%]="i.progress"></div>
            </div>
          }
          @if (i.sub ?? i.hint; as s) {
            <p class="mt-[2px] text-[12px] leading-snug text-[#595959]">{{ s }}</p>
          }
        </div>
      }
    </div>
  `,
})
export class StatStrip {
  items = input.required<readonly StatItem[]>();
  private tones = { pending: '#8a5300', ok: '#17692c', danger: '#b42318', info: '#0b5cad' };
  color(i: StatItem): string {
    const zero = i.value === 0 || i.value === '0';
    if (zero) return '#595959';
    return i.tone ? this.tones[i.tone] : '#00444f';
  }
}
