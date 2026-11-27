// =====================================================================
// login.ts - the sign-in page (/login).
//
// Flow when "Log in" is clicked:
// submit() -> AuthService.login() (core/auth.ts)
// -> POST /api/auth/login (AuthController in the API)
// -> token saved -> go to the admin or scholar dashboard.
// On error, the message from the API is shown under the form.
// =====================================================================
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
    <div
      class="relative flex min-h-screen flex-col items-center bg-cover bg-top bg-fixed px-4 pb-10 pt-[max(210px,25vh)]"
      style="background-image: linear-gradient(160deg, rgba(0,40,48,.88), rgba(0,68,79,.62) 55%, rgba(10,98,112,.55)), url('assets/login-bg.png'); background-color: #0b3d44"
    >
      <h1 class="mb-1 text-[28px] font-bold tracking-tight text-white drop-shadow">Welcome back</h1>
      <p class="mb-5 text-[16px] text-white/80">Sign in to your scholar portal</p>

      <form
        class="w-[378px] max-w-full rounded-3xl border border-white/40 bg-white/95 px-[30px] pb-7 pt-[30px] shadow-2xl shadow-black/30 backdrop-blur-xl"
        (ngSubmit)="submit()"
        #f="ngForm"
        novalidate
      >
        <label for="u" class="mb-1.5 block text-[13px] font-semibold text-label">Student ID:</label>
        <input
          id="u"
          name="username"
          [(ngModel)]="username"
          required
          autocomplete="username"
          maxlength="100"
          class="h-[44px] w-full rounded-xl border border-[#cfd8db] bg-white px-3.5 text-[15px] transition focus:ring-4 focus:ring-login/15 outline-none focus:border-login"
          [class.!border-[#b42318]]="!!error()"
          [attr.aria-invalid]="!!error()"
        />
        <label for="p" class="mb-1.5 mt-4 block text-[13px] font-semibold text-label"
          >Password:</label
        >
        <input
          id="p"
          name="password"
          type="password"
          [(ngModel)]="password"
          required
          autocomplete="current-password"
          maxlength="200"
          class="h-[44px] w-full rounded-xl border border-[#cfd8db] bg-white px-3.5 text-[15px] transition focus:ring-4 focus:ring-login/15 outline-none focus:border-login"
          [class.!border-[#b42318]]="!!error()"
          [attr.aria-invalid]="!!error()"
        />
        <p class="mt-2 text-[13px] text-[#333]">
          Forgot your password? Ask the Scholarship Office to reset it.
        </p>

        @if (error()) {
          <div
            class="mt-3 flex items-start gap-2 rounded-lg border-2 border-[#b42318] bg-[#fdecea] px-3 py-2 text-[14px] font-bold text-[#8c1d13]"
            role="alert"
          >
            <app-icon name="alert" class="mt-[1px] h-5 w-5 shrink-0"></app-icon
            ><span>{{ error() }}</span>
          </div>
        }

        <button
          type="submit"
          [disabled]="busy()"
          class="mt-5 h-[48px] w-full rounded-xl bg-gradient-to-br from-[#0a6270] to-[#00444f] text-[16px] font-semibold tracking-wide text-white shadow-lg shadow-brand/30 transition hover:brightness-110 active:scale-[.98]"
        >
          {{ busy() ? 'SIGNING IN...' : 'LOG IN' }}
        </button>
        <p class="mt-4 text-center text-[13px]">
          First time here?
          <a routerLink="/signup" class="text-[#0b5cad] underline">Sign up with your Scholar ID</a>
        </p>
      </form>
    </div>
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  // Bound to the two input boxes with [(ngModel)].
  username = '';
  password = '';
  busy = signal(false);
  error = signal('');

  // Called when the form is submitted.
  async submit(): Promise<void> {
    this.error.set('');
    if (!this.username.trim() || !this.password.trim()) {
      this.error.set('Please enter Student ID and Password.');
      return;
    }
    // busy = true disables the button so it cannot be clicked twice.
    this.busy.set(true);
    try {
      await this.auth.login(this.username.trim(), this.password.trim());
      await this.router.navigateByUrl(this.auth.homeRoute());
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
