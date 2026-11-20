import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth';

@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="fixed inset-x-0 top-0 z-30 flex h-[80px] items-center bg-brand px-5">
      <img src="assets/scholar.png" alt="" class="h-[50px] w-[55px] object-contain" />
      <span class="ml-[10px] text-[16px] font-bold text-white">IskolarAid Admin</span>
      <div class="ml-auto flex items-center gap-3">
        <img src="assets/user.png" alt="" class="h-[35px] w-[36px] object-contain" />
        <span class="text-[12pt] font-bold text-[#e6e6e6]">Administrator</span>
        <button class="btn btn-danger !h-[40px] w-[110px] !text-[14px]" (click)="auth.logout()">Logout</button>
      </div>
    </header>
    <aside class="fixed left-0 top-[80px] bottom-0 z-20 w-[280px] overflow-y-auto bg-brand pt-[45px]">
      @for (n of nav; track n.link) {
        <a [routerLink]="n.link" routerLinkActive="!bg-brand-hover font-bold !text-[16px]"
           class="flex h-[55px] w-full items-center gap-3 bg-brand px-5 text-[15px] text-white transition-colors hover:bg-brand-hover">
          <img [src]="'assets/' + n.icon" alt="" class="h-[28px] w-[28px] object-contain" />{{ n.label }}
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
    { link: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard.png' },
    { link: '/admin/scholars', label: 'Scholar Management', icon: 'scholar.png' },
    { link: '/admin/payroll', label: 'Payroll Processing', icon: 'dollar.png' },
    { link: '/admin/reports', label: 'Reports & Analytics', icon: 'analysis.png' },
    { link: '/admin/activity-logs', label: 'Activity Log', icon: 'file.png' },
    { link: '/admin/notifications', label: 'Reminder & Notification', icon: 'bell.png' },
  ];
}
