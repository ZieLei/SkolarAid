import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth';
import { AppIcon } from '../shared/icon';

@Component({
  selector: 'app-admin-shell',
  imports: [AppIcon, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="fixed inset-x-0 top-0 z-30 flex h-[80px] items-center bg-brand px-5">
      <app-icon name="scholar" class="h-[50px] w-[55px]"></app-icon>
      <span class="ml-[10px] text-[16px] font-bold text-white">IskolarAid Admin</span>
      <div class="ml-auto flex items-center gap-3">
        <app-icon name="user" class="h-[35px] w-[36px]"></app-icon>
        <span class="text-[12pt] font-bold text-[#e6e6e6]">Administrator</span>
        <button class="btn btn-danger !h-[40px] w-[110px] !text-[14px]" (click)="auth.logout()">Logout</button>
      </div>
    </header>
    <aside class="fixed left-0 top-[80px] bottom-0 z-20 w-[280px] overflow-y-auto bg-brand pt-[45px]">
      @for (n of nav; track n.link) {
        <a [routerLink]="n.link" routerLinkActive="!bg-brand-hover font-bold !text-[16px]"
           class="flex h-[55px] w-full items-center gap-3 bg-brand px-5 text-[15px] text-white transition-colors hover:bg-brand-hover">
          <app-icon [name]="n.icon" class="h-[28px] w-[28px]"></app-icon>{{ n.label }}
        </a>
      }
    </aside>
    <main class="min-h-screen bg-surface pl-[280px] pt-[80px]">
      <div class="p-[30px]"><router-outlet /></div>
    </main>
  `,
})
export class AdminShell {
  auth = inject(AuthService);
  nav = [
    { link: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { link: '/admin/scholars', label: 'Scholar Management', icon: 'scholar' },
    { link: '/admin/payroll', label: 'Payroll Processing', icon: 'dollar' },
    { link: '/admin/reports', label: 'Reports & Analytics', icon: 'analysis' },
    { link: '/admin/activity-logs', label: 'Activity Log', icon: 'file' },
    { link: '/admin/notifications', label: 'Reminder & Notification', icon: 'bell' },
  ];
}
