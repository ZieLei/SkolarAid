import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth';
import { AppIcon } from '../shared/icon';

const KEY = 'scholar-sidebar-collapsed';
function readCollapsed(): boolean { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }

@Component({
  selector: 'app-scholar-shell',
  imports: [AppIcon, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <aside class="fixed inset-y-0 left-0 z-20 overflow-y-auto overflow-x-hidden bg-brand transition-[width] duration-200" [style.width.px]="collapsed() ? 76 : 300">
      <div class="flex h-[110px] items-start px-5 pt-[15px]">
        <img src="assets/scholar.png" alt="" class="h-[55px] w-[60px] shrink-0 object-contain" />
        @if (!collapsed()) { <span class="ml-[5px] mt-[15px] whitespace-nowrap text-[16px] font-bold text-white">Iskolar Portal</span> }
      </div>
      @for (n of nav; track n.link) {
        <a [routerLink]="n.link" routerLinkActive="!bg-brand-hover font-bold !text-[17px]"
           [attr.title]="collapsed() ? n.label : null" [attr.aria-label]="n.label"
           class="flex h-[60px] w-full items-center gap-3 whitespace-nowrap bg-brand px-5 text-[16px] text-white transition-colors hover:bg-brand-hover">
          <app-icon [name]="n.icon" class="h-[28px] w-[28px]"></app-icon>@if (!collapsed()) { {{ n.label }} }
        </a>
      }
    </aside>
    <main class="min-h-screen bg-surface transition-[padding] duration-200" [style.padding-left.px]="collapsed() ? 76 : 300">
      <header class="flex h-[80px] items-center px-[30px]">
        <button type="button" class="mr-3 flex h-[36px] w-[36px] items-center justify-center rounded text-brand hover:bg-black/5" (click)="toggle()" [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'" [attr.aria-expanded]="!collapsed()"><app-icon name="menu" class="h-[24px] w-[24px]"></app-icon></button>
        <h1 class="text-[20px] font-bold text-ink">{{ title() }}</h1>
        <div class="ml-auto flex items-center gap-3">
          <app-icon name="user" class="h-[35px] w-[36px]"></app-icon>
          <span class="text-[12pt] font-bold text-black">{{ auth.user()?.name }}</span>
          <button class="btn btn-danger !h-[40px] w-[110px] !text-[14px]" (click)="auth.logout()">Logout</button>
        </div>
      </header>
      <div class="px-[30px] pb-[30px]"><router-outlet /></div>
    </main>
  `,
})
export class ScholarShell {
  auth = inject(AuthService);
  collapsed = signal(readCollapsed());
  toggle() { this.collapsed.update((v) => !v); try { localStorage.setItem(KEY, this.collapsed() ? '1' : '0'); } catch { /* storage unavailable */ } }
  nav = [
    { link: '/scholar/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { link: '/scholar/profile', label: 'My Profile', icon: 'user-profile' },
    { link: '/scholar/payments', label: 'Payment History', icon: 'dollar' },
    { link: '/scholar/compliance', label: 'Compliance', icon: 'file' },
    { link: '/scholar/notifications', label: 'Notifications', icon: 'bell' },
  ];
  private router = inject(Router);
  private url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map((e) => (e as NavigationEnd).urlAfterRedirects)), { initialValue: this.router.url });
  title = computed(() => this.nav.find((n) => this.url().startsWith(n.link))?.label ?? '');
}
