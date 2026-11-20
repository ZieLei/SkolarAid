import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth';

@Component({
  selector: 'app-scholar-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <aside class="fixed inset-y-0 left-0 z-20 w-[300px] overflow-y-auto bg-brand">
      <div class="flex h-[110px] items-start px-5 pt-[15px]">
        <img src="assets/scholar.png" alt="" class="h-[55px] w-[60px] object-contain" />
        <span class="ml-[5px] mt-[15px] text-[16px] font-bold text-white">Iskolar Portal</span>
      </div>
      @for (n of nav; track n.link) {
        <a [routerLink]="n.link" routerLinkActive="!bg-brand-hover font-bold !text-[17px]"
           class="flex h-[60px] w-full items-center gap-3 bg-brand px-5 text-[16px] text-white transition-colors hover:bg-brand-hover">
          <img [src]="'assets/' + n.icon" alt="" class="h-[28px] w-[28px] object-contain" />{{ n.label }}
        </a>
      }
    </aside>
    <main class="min-h-screen bg-surface pl-[300px]">
      <header class="flex h-[80px] items-center px-[30px]">
        <h1 class="text-[20px] font-bold text-ink">{{ title() }}</h1>
        <div class="ml-auto flex items-center gap-3">
          <img src="assets/user.png" alt="" class="h-[35px] w-[36px] object-contain" />
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
  nav = [
    { link: '/scholar/dashboard', label: 'Dashboard', icon: 'dashboard.png' },
    { link: '/scholar/profile', label: 'My Profile', icon: 'user-profile.png' },
    { link: '/scholar/payments', label: 'Payment History', icon: 'dollar.png' },
    { link: '/scholar/compliance', label: 'Compliance', icon: 'file.png' },
    { link: '/scholar/notifications', label: 'Notifications', icon: 'bell.png' },
  ];
  private router = inject(Router);
  private url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map((e) => (e as NavigationEnd).urlAfterRedirects)), { initialValue: this.router.url });
  title = computed(() => this.nav.find((n) => this.url().startsWith(n.link))?.label ?? '');
}
