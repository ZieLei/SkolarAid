// =====================================================================
// scroll-cue.ts - add the "scrollCue" attribute to a scroll box and it
// shows a shadow when there is more content to scroll to.
// =====================================================================
import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Adds `cue-l` / `cue-r` classes while a scroll container has more content to the left / right,
 * so styles.css can fade that edge. Makes clipped table columns visibly scrollable.
 */
@Directive({ selector: '[scrollCue]' })
export class ScrollCue implements OnInit, OnDestroy {
  private el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private ro?: ResizeObserver;
  private mo?: MutationObserver;
  private update = (): void => {
    const e = this.el;
    e.classList.toggle('cue-l', e.scrollLeft > 4);
    e.classList.toggle('cue-r', e.scrollLeft + e.clientWidth < e.scrollWidth - 4);
  };

  ngOnInit(): void {
    this.el.addEventListener('scroll', this.update, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(this.update);
      this.ro.observe(this.el);
    }
    // Rows arrive asynchronously; re-check when the content changes.
    if (typeof MutationObserver !== 'undefined') {
      this.mo = new MutationObserver(this.update);
      this.mo.observe(this.el, { childList: true, subtree: true });
    }
    this.update();
  }
  ngOnDestroy(): void {
    this.el.removeEventListener('scroll', this.update);
    this.ro?.disconnect();
    this.mo?.disconnect();
  }
}
