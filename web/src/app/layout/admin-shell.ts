import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth';
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
        <span class="text-[12pt] font-bold text-[#e6e6e6]">Administrator</span>
        <button class="btn btn-danger !h-[40px] w-[110px] !text-[14px]" (click)="auth.logout()">Logout</button>
      </div>
    </header>
    <aside class="fixed left-0 top-[80px] bottom-0 z-20 overflow-y-auto overflow-x-hidden bg-brand pt-[45px] transition-[width] duration-200" [style.width.px]="collapsed() ? 72 : 280">
      @for (n of nav; track n.link) {
        <a [routerLink]="n.link" routerLinkActive="!bg-brand-hover font-bold !text-[16px]"
           [attr.title]="collapsed() ? n.label : null" [attr.aria-label]="n.label"
           class="flex h-[55px] w-full items-center gap-3 whitespace-nowrap bg-brand px-5 text-[15px] text-white transition-colors hover:bg-brand-hover">
          <app-icon [name]="n.icon" class="h-[28px] w-[28px]"></app-icon>@if (!collapsed()) { {{ n.label }} }
        </a>
      }
    </aside>
    <main class="min-h-screen bg-surface pt-[80px] transition-[padding] duration-200" [style.padding-left.px]="collapsed() ? 72 : 280">
      <div class="p-[30px]"><router-outlet /></div>
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
    { link: '/admin/notifications', label: 'Reminder & Notification', icon: 'bell' },
  ];
}
