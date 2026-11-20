import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../core/api';
import { AuthService } from '../core/auth';

/** Mirrors the WinForms Login screen: full-bleed background, greeting, white card with Student ID / Password. */
@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="relative flex min-h-screen flex-col items-center bg-cover bg-center px-4 pb-10 pt-[17vh] font-['Segoe_UI','Microsoft_Sans_Serif',Arial,sans-serif]"
         style="background-image: url('assets/login-bg.png'); background-color: #0b3d44">
      <p class="text-[20px] text-[snow]">Hello there,</p>
      <h1 class="text-[22.75px] font-bold text-[snow]">Welcome back to IskolarAid</h1>
      <p class="mb-5 text-[16px] text-[snow]">Sign in to access your scholar portal</p>

      <form class="w-[378px] max-w-full rounded-[18px] bg-gradient-to-b from-[#e9e9e9] to-white px-[30px] pb-6 pt-[28px] shadow-xl" (ngSubmit)="submit()" #f="ngForm" novalidate>
        <label for="u" class="mb-1 block text-[13px]">Student ID:</label>
        <input id="u" name="username" [(ngModel)]="username" required autocomplete="username" maxlength="100"
               class="h-[40px] w-full rounded-[8px] border-2 border-black/80 bg-transparent px-3 text-[15px] outline-none focus:border-login" />
        <label for="p" class="mb-1 mt-4 block text-[13px]">Password:</label>
        <input id="p" name="password" type="password" [(ngModel)]="password" required autocomplete="current-password" maxlength="200"
               class="h-[38px] w-full rounded-[8px] border-2 border-black/80 bg-transparent px-3 text-[15px] outline-none focus:border-login" />
        <div class="mt-1 text-right text-[11px] italic" title="Please contact the Scholarship Office to reset your password.">Forgot password?</div>

        @if (error()) { <p class="mt-2 rounded bg-red-50 px-2 py-1 text-[13px] text-red-700" role="alert">{{ error() }}</p> }

        <button type="submit" [disabled]="busy()"
                class="mt-5 h-[48px] w-full rounded-[10px] bg-login text-[18px] font-bold text-white transition hover:brightness-110">
          {{ busy() ? 'SIGNING IN...' : 'LOG IN' }}
        </button>
        <p class="mt-4 text-center text-[13px]">Doesn't have an account? <a routerLink="/register" class="text-blue-700 underline">Sign up</a></p>
      </form>

      <p class="mt-6 max-w-[481px] text-center text-[14px] leading-snug text-[snow]">
        "Take control of your scholarship records and track your<br />disbursements and payroll for easy access"
      </p>
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
