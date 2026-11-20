import { Component, input } from '@angular/core';

export interface StatItem { label: string; value: string | number; sub?: string; hint?: string; tone?: 'pending' | 'ok' | 'danger' | 'info'; progress?: number; }

/**
 * One slim summary bar instead of a row of big cards. Zero values are shown in muted grey
 * so only numbers that need attention stand out.
 */
@Component({
  selector: 'app-stat-strip',
  template: `
    <div class="card flex w-fit max-w-full flex-wrap divide-x divide-[#e6e6e6]" role="group" aria-label="Summary">
      @for (i of items(); track i.label) {
        <div class="min-w-[150px] max-w-[320px] px-5 py-3" [attr.title]="i.hint ?? null">
          <p class="text-[12px] font-bold uppercase tracking-wide text-[#4b5563]">{{ i.label }}</p>
          <p class="text-[24px] font-bold leading-tight" [style.color]="color(i)">{{ i.value }}</p>
          @if (i.progress !== undefined) { <div class="mt-1 h-[6px] w-full overflow-hidden rounded bg-[#e6e6e6]"><div class="h-full bg-ok" [style.width.%]="i.progress"></div></div> }
          @if (i.sub ?? i.hint; as s) { <p class="mt-[2px] text-[12px] leading-snug text-[#595959]">{{ s }}</p> }
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
