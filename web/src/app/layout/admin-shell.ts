import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { DialogService } from '../core/dialog';
import { NotificationStats } from '../core/models';
import { AppIcon } from '../shared/icon';

const KEY = 'admin-sidebar-collapsed';
function readCollapsed(): boolean { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }

@Component({
  selector: 'app-admin-shell',
  imports: [AppIcon, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <aside class="fixed inset-y-0 left-0 z-20 overflow-y-auto overflow-x-hidden bg-brand transition-[width] duration-200" [style.width.px]="collapsed() ? 76 : 300">
      <div class="flex h-[110px] flex-col justify-center px-5">
        @if (collapsed()) { <img src="assets/logo-mark-white.svg" alt="IskolarAid" class="mx-auto h-[40px]" /> }
        @else {
          <img src="assets/logo-white.svg" alt="IskolarAid" class="h-[44px] w-auto self-start" />
          <span class="mt-2 text-[12px] font-bold uppercase tracking-[.14em] text-white/80">Admin portal</span>
        }
      </div>
      @for (n of nav; track n.label) {
        <a [routerLink]="n.link" [queryParams]="n.query" routerLinkActive="!bg-brand-hover font-bold"
           [routerLinkActiveOptions]="{ paths: 'subset', queryParams: 'exact', fragment: 'ignored', matrixParams: 'ignored' }"
           [attr.title]="collapsed() ? n.label : null" [attr.aria-label]="n.label"
           class="relative flex h-[60px] w-full items-center gap-3 whitespace-nowrap bg-brand px-5 text-[15px] text-white transition-colors hover:bg-brand-hover">
          <app-icon [name]="n.icon" class="h-[28px] w-[28px]"></app-icon>@if (!collapsed()) { {{ n.label }} }
          @if (n.badge && pendingRegs() > 0) { <span class="rounded-full bg-white px-2 text-[12px] font-bold text-brand" [class.ml-auto]="!collapsed()" [class.absolute]="collapsed()" [class.right-1]="collapsed()" [class.top-1]="collapsed()" [attr.aria-label]="pendingRegs() + ' waiting'">{{ pendingRegs() }}</span> }
        </a>
      }
    </aside>
    <main class="min-h-screen bg-surface transition-[padding] duration-200" [style.padding-left.px]="collapsed() ? 76 : 300">
      <header class="flex h-[80px] items-center px-[30px]">
        <button type="button" class="mr-3 flex h-[36px] w-[36px] items-center justify-center rounded text-brand hover:bg-black/5" (click)="toggle()" [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'" [attr.aria-expanded]="!collapsed()"><app-icon name="menu" class="h-[24px] w-[24px]"></app-icon></button>
        <h1 class="text-[20px] font-bold text-ink">{{ title() }}</h1>
        <div class="ml-auto flex items-center gap-3">
          <app-icon name="user" class="h-[35px] w-[36px]"></app-icon>
          <span class="text-[14px] font-bold text-ink">Administrator</span>
          <button class="btn btn-outline !h-[40px] w-[110px] !text-[14px]" (click)="confirmLogout()">Logout</button>
        </div>
      </header>
      <div class="px-[30px] pb-[30px]"><router-outlet /></div>
    </main>
  `,
})
export class AdminShell {
  auth = inject(AuthService);
  private dialog = inject(DialogService);
  async confirmLogout(): Promise<void> {
    if (await this.dialog.confirm('You will need to sign in again to continue.', 'Log out of IskolarAid?', 'Log out', 'Stay signed in')) this.auth.logout();
  }
  collapsed = signal(readCollapsed());
  toggle() { this.collapsed.update((v) => !v); try { localStorage.setItem(KEY, this.collapsed() ? '1' : '0'); } catch { /* storage unavailable */ } }
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
  title = computed(() => {
    const u = this.url();
    if (u.includes('tab=reg')) return 'Scholar Registrations';
    return this.nav.find((n) => !n.query && u.startsWith(n.link))?.label ?? '';
  });

  constructor() {
    // Keep the "Registrations" badge fresh as the admin moves around.
    const load = () => void firstValueFrom(this.api.get<NotificationStats>('/admin/notifications/stats')).then((s) => this.pendingRegs.set(s.pendingRegistrations)).catch(() => undefined);
    load();
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe(load);
  }
}
