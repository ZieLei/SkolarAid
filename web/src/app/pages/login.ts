import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../core/api';
import { AuthService } from '../core/auth';
import { AppIcon } from '../shared/icon';

/** Mirrors the WinForms Login screen: full-bleed background, greeting, white card with Student ID / Password. */
@Component({
  selector: 'app-login',
  imports: [AppIcon, FormsModule, RouterLink],
  template: `
    <div class="relative flex min-h-screen flex-col items-center bg-cover bg-top bg-fixed px-4 pb-10 pt-[max(210px,25vh)]"
         style="background-image: linear-gradient(rgba(0,32,38,.55), rgba(0,32,38,.55)), url('assets/login-bg.png'); background-color: #0b3d44">
      <h1 class="mb-1 text-[24px] font-bold text-[snow]">Welcome back</h1>
      <p class="mb-5 text-[16px] text-[snow]">Sign in to your scholar portal</p>

      <form class="w-[378px] max-w-full rounded-[18px] bg-gradient-to-b from-[#e9e9e9] to-white px-[30px] pb-6 pt-[28px] shadow-xl" (ngSubmit)="submit()" #f="ngForm" novalidate>
        <label for="u" class="mb-1 block text-[14px]">Student ID:</label>
        <input id="u" name="username" [(ngModel)]="username" required autocomplete="username" maxlength="100"
               class="h-[40px] w-full rounded-[8px] border-2 border-black/80 bg-transparent px-3 text-[15px] outline-none focus:border-login" [class.!border-[#b42318]]="!!error()" [attr.aria-invalid]="!!error()" />
        <label for="p" class="mb-1 mt-4 block text-[14px]">Password:</label>
        <input id="p" name="password" type="password" [(ngModel)]="password" required autocomplete="current-password" maxlength="200"
               class="h-[40px] w-full rounded-[8px] border-2 border-black/80 bg-transparent px-3 text-[15px] outline-none focus:border-login" [class.!border-[#b42318]]="!!error()" [attr.aria-invalid]="!!error()" />
        <p class="mt-2 text-[13px] text-[#333]">Forgot your password? Ask the Scholarship Office to reset it.</p>

        @if (error()) { <div class="mt-3 flex items-start gap-2 rounded-lg border-2 border-[#b42318] bg-[#fdecea] px-3 py-2 text-[14px] font-bold text-[#8c1d13]" role="alert"><app-icon name="alert" class="mt-[1px] h-5 w-5 shrink-0"></app-icon><span>{{ error() }}</span></div> }

        <button type="submit" [disabled]="busy()"
                class="mt-5 h-[48px] w-full rounded-[10px] bg-login text-[18px] font-bold text-white transition hover:brightness-110">
          {{ busy() ? 'SIGNING IN...' : 'LOG IN' }}
        </button>
        <p class="mt-4 text-center text-[13px]">Don't have an account? <a routerLink="/register" class="text-[#0b5cad] underline">Apply for a scholarship</a></p>
      </form>

      
    </div>
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  username = '';
  password = '';
  busy = signal(false);
  error = signal('');

  async submit(): Promise<void> {
    this.error.set('');
    if (!this.username.trim() || !this.password.trim()) { this.error.set('Please enter Student ID and Password.'); return; }
    this.busy.set(true);
    try {
      await this.auth.login(this.username.trim(), this.password.trim());
      await this.router.navigateByUrl(this.auth.homeRoute());
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }
}
