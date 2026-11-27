// =====================================================================
// live-status.ts - the small "Live / Offline" pill in the top bar.
// It reads RealtimeService.state (core/realtime.ts).
// =====================================================================
import { Component, computed, inject } from '@angular/core';
import { RealtimeService } from '../core/realtime';

/** Header pill showing whether live updates are on. Pages still load over HTTP when it is offline. */
@Component({
  selector: 'app-live-status',
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-full border border-black/5 px-2.5 py-1 text-[12px] font-semibold shadow-sm"
      [class]="view().cls"
      role="status"
      [attr.title]="view().hint"
    >
      <span class="h-2 w-2 rounded-full" [class]="view().dot" aria-hidden="true"></span
      >{{ view().label }}
    </span>
  `,
})
export class LiveStatus {
  private rt = inject(RealtimeService);
  view = computed(() => {
    switch (this.rt.state()) {
      case 'Connected':
        return {
          label: 'Live',
          cls: 'bg-white text-ok',
          dot: 'bg-ok',
          hint: 'Updates appear automatically.',
        };
      case 'Connecting':
      case 'Reconnecting':
        return {
          label: 'Reconnecting…',
          cls: 'bg-white text-pending',
          dot: 'bg-warn animate-pulse',
          hint: 'Trying to restore live updates.',
        };
      default:
        return {
          label: 'Offline',
          cls: 'bg-white text-muted',
          dot: 'bg-muted',
          hint: 'Live updates are off. Use Refresh to see the latest data.',
        };
    }
  });
}
