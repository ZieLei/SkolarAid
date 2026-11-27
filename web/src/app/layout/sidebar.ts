// =====================================================================
// sidebar.ts - shared sidebar behaviour for both portals (admin and scholar).
//
// Wide screens (1024 px and up): the sidebar is always on screen and the
//   menu button collapses it to icons (remembered in localStorage).
// Narrower screens (phones, tablets): the sidebar is hidden and the menu
//   button slides it in as a drawer over the page. It closes when a page
//   is picked, when the dark layer is tapped, or when Escape is pressed.
//
// Create it as a field of the shell component:  side = new SidebarState('admin-sidebar-collapsed');
// =====================================================================
import { DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

const WIDE = '(min-width: 1024px)';

export class SidebarState {
  /** Collapsed to icons (wide screens only). */
  readonly collapsed: ReturnType<typeof signal<boolean>>;
  /** True on wide screens, false on phones / tablets. */
  readonly wide = signal(typeof matchMedia === 'function' ? matchMedia(WIDE).matches : true);
  /** The phone drawer is open. */
  readonly drawerOpen = signal(false);
  /** Show only icons (no labels). */
  readonly iconsOnly = computed(() => this.wide() && this.collapsed());
  /** Sidebar width in px. */
  readonly width = computed(() => (this.iconsOnly() ? 76 : this.wide() ? 300 : 280));
  /** Space the page leaves on the left for the sidebar (none when it is a drawer). */
  readonly pagePadding = computed(() => (this.wide() ? this.width() : 0));
  /** The sidebar is off screen (closed drawer): hide its links from keyboard and screen readers. */
  readonly hidden = computed(() => !this.wide() && !this.drawerOpen());

  constructor(private storageKey: string) {
    let saved = false;
    try { saved = localStorage.getItem(storageKey) === '1'; } catch { /* storage unavailable */ }
    this.collapsed = signal(saved);

    if (typeof matchMedia === 'function') {
      const mq = matchMedia(WIDE);
      const onChange = () => { this.wide.set(mq.matches); this.drawerOpen.set(false); };
      mq.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', onChange));
    }
    inject(Router).events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => this.drawerOpen.set(false));
  }

  /** The ☰ button: collapse/expand on wide screens, open/close the drawer on small ones. */
  menuButton(): void {
    if (!this.wide()) { this.drawerOpen.update((v) => !v); return; }
    this.collapsed.update((v) => !v);
    try { localStorage.setItem(this.storageKey, this.collapsed() ? '1' : '0'); } catch { /* storage unavailable */ }
  }

  menuLabel(): string { return this.wide() ? (this.collapsed() ? 'Expand sidebar' : 'Collapse sidebar') : this.drawerOpen() ? 'Close menu' : 'Open menu'; }
}
