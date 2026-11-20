import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { Api } from '../core/api';
import { AuthService } from '../core/auth';
import { NotificationStats } from '../core/models';
import { AppIcon } from '../shared/icon';

const KEY = 'admin-sidebar-collapsed';
function readCollapsed(): boolean { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }

@Component({
  selector: 'app-admin-shell',
  imports: [AppIcon, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="fixed inset-x-0 top-0 z-30 flex h-[80px] items-center bg-brand px-5">
      <button type="button" class="mr-3 flex h-[36px] w-[36px] items-center justify-center rounded text-white hover:bg-brand-hover" (click)="toggle()" [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'" [attr.aria-expanded]="!collapsed()"><app-icon name="menu" class="h-[24px] w-[24px]"></app-icon></button>
      <img src="assets/scholar.png" alt="" class="h-[50px] w-[55px] object-contain" />
      <span class="ml-[10px] text-[16px] font-bold text-white">IskolarAid Admin</span>
      <div class="ml-auto flex items-center gap-3">
        <app-icon name="user" class="h-[35px] w-[36px]"></app-icon>
        <span class="text-[14px] font-bold text-[#e6e6e6]">Administrator</span>
        <button class="btn btn-ghost !h-[40px] w-[110px] !text-[14px]" (click)="auth.logout()">Logout</button>
      </div>
    </header>
    <aside class="fixed left-0 top-[80px] bottom-0 z-20 overflow-y-auto overflow-x-hidden bg-brand pt-[45px] transition-[width] duration-200" [style.width.px]="collapsed() ? 72 : 280">
      @for (n of nav; track n.label) {
        <a [routerLink]="n.link" [queryParams]="n.query" routerLinkActive="!bg-brand-hover font-bold"
           [routerLinkActiveOptions]="{ paths: 'subset', queryParams: 'exact', fragment: 'ignored', matrixParams: 'ignored' }"
           [attr.title]="collapsed() ? n.label : null" [attr.aria-label]="n.label"
           class="flex h-[55px] w-full items-center gap-3 whitespace-nowrap bg-brand px-5 text-[15px] text-white transition-colors hover:bg-brand-hover">
          <app-icon [name]="n.icon" class="h-[28px] w-[28px]"></app-icon>@if (!collapsed()) { {{ n.label }} }
          @if (n.badge && pendingRegs() > 0) { <span class="ml-auto rounded-full bg-white px-2 text-[12px] font-bold text-brand" [attr.aria-label]="pendingRegs() + ' waiting'">{{ pendingRegs() }}</span> }
        </a>
      }
    </aside>
    <main class="min-h-screen bg-surface pt-[80px] transition-[padding] duration-200" [style.padding-left.px]="collapsed() ? 72 : 280">
      <div class="p-[30px]">
        @if (title(); as t) { <h1 class="page-title mb-4">{{ t }}</h1> }
        <router-outlet />
      </div>
    </main>
  `,
})
export class AdminShell {
  auth = inject(AuthService);
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
  /** Dashboard and Scholar Management draw their own heading; every other page gets one here. */
  title = computed(() => {
    const u = this.url();
    if (u.startsWith('/admin/dashboard') || u.startsWith('/admin/scholars')) return '';
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
