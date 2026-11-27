// =====================================================================
// admin-shell.ts - the frame around every admin page:
// left sidebar (menu), top bar (page title, live status, logout),
// and <router-outlet> in the middle where the current page is shown.
//
// It also:
// - keeps the "Registrations" badge count up to date
// - opens the live-update connection (RealtimeService) while an admin is logged in
// - pops up a toast when a new registration arrives or a scholar uploads a document
// =====================================================================
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, firstValueFrom, map, merge } from 'rxjs';
import { Api, errorMessage } from '../core/api';
import { AuthService } from '../core/auth';
import { DialogService } from '../core/dialog';
import { NotificationStats } from '../core/models';
import { RealtimeService } from '../core/realtime';
import { ToastService } from '../core/toast';
import { LiveStatus } from '../shared/live-status';
import { AppIcon } from '../shared/icon';
import { SidebarState } from './sidebar';
import { Avatar, ProfilePictures } from '../shared/avatar';


@Component({
  selector: 'app-admin-shell',
  imports: [AppIcon, Avatar, LiveStatus, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <!-- Phones / tablets: dark layer behind the open drawer; tap it to close. -->
    @if (side.drawerOpen()) { <div class="fixed inset-0 z-20 bg-black/40 lg:hidden" (click)="side.drawerOpen.set(false)" aria-hidden="true"></div> }
    <aside class="fixed inset-y-0 left-0 z-30 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-[#06505c] via-brand to-[#00333c] shadow-xl shadow-black/10 transition-[width,transform] duration-200" (keydown.escape)="side.drawerOpen.set(false)"
           [style.width.px]="side.width()" [style.transform]="side.hidden() ? 'translateX(-100%)' : 'none'" [attr.aria-hidden]="side.hidden() ? true : null" [attr.inert]="side.hidden() ? '' : null">
      <div class="flex h-[100px] flex-col justify-center px-5 lg:h-[110px]">
        @if (side.iconsOnly()) { <img src="assets/logo-mark-white.svg" alt="IskolarAid" class="mx-auto h-[40px]" /> }
        @else {
          <img src="assets/logo-white.svg" alt="IskolarAid" class="h-[44px] w-auto self-start" />
          <span class="mt-2 text-[11px] font-semibold uppercase tracking-[.18em] text-white/60">Admin portal</span>
        }
      </div>
      @for (n of nav; track n.label) {
        <a [routerLink]="n.link" routerLinkActive="!bg-white/15 !text-white font-semibold shadow-inner ring-1 ring-white/10"
           [queryParams]="n.query" [routerLinkActiveOptions]="{ paths: 'subset', queryParams: 'exact', fragment: 'ignored', matrixParams: 'ignored' }"
           [attr.title]="side.iconsOnly() ? n.label : null" [attr.aria-label]="n.label"
           class="relative mx-3 mb-1 flex h-[46px] items-center gap-3 whitespace-nowrap rounded-xl px-3 text-[14px] text-white/75 transition-colors hover:bg-white/10 hover:text-white" style="width: calc(100% - 24px)">
          <app-icon [name]="n.icon" class="h-[22px] w-[22px] shrink-0"></app-icon>@if (!side.iconsOnly()) { {{ n.label }} }
          @if (n.badge && pendingRegs() > 0) { <span class="rounded-full bg-[#ffd166] px-2 text-[11px] font-bold text-[#4a3000]" [class.ml-auto]="!side.iconsOnly()" [class.absolute]="side.iconsOnly()" [class.right-1]="side.iconsOnly()" [class.top-1]="side.iconsOnly()" [attr.aria-label]="pendingRegs() + ' waiting'">{{ pendingRegs() }}</span> }
        </a>
      }
    </aside>
    <main class="min-h-screen bg-surface transition-[padding] duration-200" [style.padding-left.px]="side.pagePadding()">
      <header class="sticky top-0 z-10 flex min-h-[64px] items-center gap-2 border-b border-line bg-white/75 px-3 py-2 backdrop-blur-md sm:px-4 lg:min-h-[72px] lg:px-[30px]"> 
        <button type="button" class="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-xl text-brand hover:bg-brand-soft" (click)="side.menuButton()"
                [attr.aria-label]="side.menuLabel()" [attr.aria-expanded]="side.wide() ? !side.collapsed() : side.drawerOpen()"><app-icon name="menu" class="h-[24px] w-[24px]"></app-icon></button>
        <!-- Long titles wrap onto a second line instead of being cut off. -->
        <h1 class="min-w-0 flex-1 break-words text-[17px] font-semibold leading-tight tracking-tight text-ink sm:text-[18px] lg:text-[20px]">{{ title() }}</h1>
        <div class="flex shrink-0 items-center gap-2 lg:gap-3">
          <app-live-status class="hidden sm:inline-flex lg:mr-2" />
          <label class="flex cursor-pointer items-center gap-2" title="Change your profile picture"><app-avatar path="/me/picture" alt="My profile picture" class="h-[36px] w-[36px] overflow-hidden rounded-full ring-2 ring-white shadow" />
            <input type="file" class="hidden" accept="image/jpeg,image/png,image/webp" (change)="changePicture($event)" />
            <span class="hidden text-[14px] font-bold text-ink md:inline">Administrator</span></label>
          <button class="btn btn-outline !h-[38px] !px-2 !text-[14px] sm:!px-4" (click)="confirmLogout()" aria-label="Log out" title="Log out">
            <app-icon name="logout" class="h-5 w-5 sm:hidden"></app-icon><span class="hidden sm:inline">Logout</span></button>
        </div>
      </header>
      <div class="px-3 pb-8 pt-5 sm:px-4 lg:px-[30px] lg:pb-[30px]"><router-outlet /></div>
    </main>
  `,
})
export class AdminShell {
  auth = inject(AuthService);
  private dialog = inject(DialogService);
  // Ask first, then log out (AuthService clears the session and goes to /login).
  async confirmLogout(): Promise<void> {
    if (await this.dialog.confirm('You will need to sign in again to continue.', 'Log out of IskolarAid?', 'Log out', 'Stay signed in')) this.auth.logout();
  }
  // Sidebar: fixed on wide screens, a drawer on phones (layout/sidebar.ts).
  side = new SidebarState('admin-sidebar-collapsed');
  // Sidebar menu items. "Registrations" is the Notifications page opened on its registrations tab.
  nav = [
    { link: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { link: '/admin/scholars', label: 'Scholar Management', icon: 'scholar' },
    { link: '/admin/payroll', label: 'Payroll Processing', icon: 'dollar' },
    { link: '/admin/reports', label: 'Reports & Analytics', icon: 'analysis' },
    { link: '/admin/activity-logs', label: 'Activity Log', icon: 'file' },
    { link: '/admin/notifications', label: 'Notifications', icon: 'bell' },
    { link: '/admin/notifications', query: { tab: 'reg' }, label: 'Registrations', icon: 'user-groups', badge: true },
  ] as { link: string; label: string; icon: string; query?: Record<string, string>; badge?: boolean }[];

  private api = inject(Api);
  private router = inject(Router);
  pendingRegs = signal(0);
  private url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map((e) => (e as NavigationEnd).urlAfterRedirects)), { initialValue: this.router.url });
  /** Shown in the header, as in the scholar portal. */
  // Page title in the top bar, based on the current URL.
  title = computed(() => {
    const u = this.url();
    if (u.includes('tab=reg')) return 'Scholar Registrations';
    return this.nav.find((n) => !n.query && u.startsWith(n.link))?.label ?? '';
  });

  constructor() {
    // Keep the "Registrations" badge fresh as the admin moves around.
    // Ask the API how many registrations are waiting (for the badge).
    const load = () => void firstValueFrom(this.api.get<NotificationStats>('/admin/notifications/stats')).then((s) => this.pendingRegs.set(s.pendingRegistrations)).catch(() => undefined);
    load();
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe(load);

    // Live updates: one connection while the admin portal is open.
    // Open the live connection now; close it when the admin leaves (logout).
    const rt = inject(RealtimeService);
    const toast = inject(ToastService);
    rt.connect();
    inject(DestroyRef).onDestroy(() => rt.disconnect());
    // Refresh the badge when a registration is sent or reviewed.
    merge(rt.registrationSubmitted$, rt.registrationReviewed$, rt.reconnected$).pipe(takeUntilDestroyed()).subscribe(load);
    rt.registrationSubmitted$.pipe(takeUntilDestroyed()).subscribe((r) =>
      toast.show(`New scholar registration from ${r.name}.`, { actionLabel: 'Review', onAction: () => void this.router.navigate(['/admin/notifications'], { queryParams: { tab: 'reg' } }) }));
    rt.complianceChanged$.pipe(filter((c) => c.byScholar), takeUntilDestroyed()).subscribe((c) =>
      toast.show(`A scholar submitted ${c.requirement} for review.`));
  }

  // Admin clicks their avatar in the top bar to upload a new profile picture.
  private pictures = inject(ProfilePictures);
  private toastSvc = inject(ToastService);
  async changePicture(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file) return;
    const fd = new FormData(); fd.append('file', file, file.name);
    try { await firstValueFrom(this.api.put('/me/picture', fd)); this.pictures.changed(); this.toastSvc.show('Profile picture updated.'); }
    catch (e) { void this.dialog.error(errorMessage(e), 'Could not upload picture'); }
  }
}
