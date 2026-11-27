// =====================================================================
// signup.ts - the sign-up page (/signup) for scholars who are ALREADY
// in the system (the Scholarship Office added them). It is not a
// scholarship application.
//
// Flow:
// 1. The scholar types their Scholar ID (e.g. SCH-2026-001), their
//    Student ID or email, and the password they want.
// 2. submit() checks the form, then AuthService.signUp()
//    -> POST /api/auth/signup (AuthController -> AuthService.SignUpAsync).
// 3. The API checks the Scholar ID matches, activates the account and
//    logs them in. We show their username and go to their dashboard.
// =====================================================================
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../core/api';
import { AuthService } from '../core/auth';
import { DialogService } from '../core/dialog';
import { AppIcon } from '../shared/icon';
import { ErrorSummary, FieldError, FormErrors, focusField } from '../shared/form-errors';

@Component({
  selector: 'app-signup',
  imports: [AppIcon, ErrorSummary, FormsModule, RouterLink],
  template: `
    <div
      class="relative flex min-h-screen flex-col items-center bg-cover bg-top bg-fixed px-4 pb-10 pt-[max(140px,16vh)]"
      style="background-image: linear-gradient(160deg, rgba(0,40,48,.88), rgba(0,68,79,.62) 55%, rgba(10,98,112,.55)), url('assets/login-bg.png'); background-color: #0b3d44"
    >
      <h1 class="mb-1 text-[28px] font-bold tracking-tight text-white drop-shadow">
        Activate your scholar account
      </h1>
      <p class="mb-5 max-w-[440px] text-center text-[15px] text-white/80">
        For scholars already added by the Scholarship Office. Use the Scholar ID from your welcome
        email.
      </p>

      <form
        class="relative w-[440px] max-w-full rounded-3xl border border-white/40 bg-white/95 px-[30px] pb-7 pt-[30px] shadow-2xl shadow-black/30 backdrop-blur-xl"
        (ngSubmit)="submit()"
        novalidate
      >
        <a
          routerLink="/login"
          class="absolute right-4 top-3 flex h-[32px] w-[32px] items-center justify-center rounded-full text-[22px] leading-none text-[#444] hover:bg-black/10"
          aria-label="Close and go back to log in"
          title="Back to log in"
          >×</a
        >

        @if (errs.list().length) {
          <div class="mb-4"><app-error-summary [errors]="errs.list()" (pick)="goTo($event)" /></div>
        }

        <label for="sn" class="mb-1.5 block text-[13px] font-semibold text-label"
          >Scholar ID:</label
        >
        <input
          id="sn"
          name="scholarNumber"
          [(ngModel)]="scholarNumber"
          (ngModelChange)="recheck()"
          autocomplete="off"
          maxlength="30"
          placeholder="SCH-2026-001"
          class="h-[44px] w-full rounded-xl border border-[#cfd8db] bg-white px-3.5 text-[15px] transition focus:ring-4 focus:ring-login/15 uppercase outline-none focus:border-login"
          [attr.aria-invalid]="errs.has('sn')"
        />
        @if (errs.get('sn'); as m) {
          <p class="field-err">{{ m }}</p>
        }

        <label for="sid" class="mb-1.5 mt-4 block text-[13px] font-semibold text-label"
          >Student ID or email:</label
        >
        <input
          id="sid"
          name="studentIdOrEmail"
          [(ngModel)]="studentIdOrEmail"
          (ngModelChange)="recheck()"
          autocomplete="username"
          maxlength="150"
          class="h-[44px] w-full rounded-xl border border-[#cfd8db] bg-white px-3.5 text-[15px] transition focus:ring-4 focus:ring-login/15 outline-none focus:border-login"
          [attr.aria-invalid]="errs.has('sid')"
        />
        @if (errs.get('sid'); as m) {
          <p class="field-err">{{ m }}</p>
        }

        <label for="pw" class="mb-1.5 mt-4 block text-[13px] font-semibold text-label"
          >Choose a password:</label
        >
        <input
          id="pw"
          name="password"
          [type]="show() ? 'text' : 'password'"
          [(ngModel)]="password"
          (ngModelChange)="recheck()"
          autocomplete="new-password"
          maxlength="200"
          class="h-[44px] w-full rounded-xl border border-[#cfd8db] bg-white px-3.5 text-[15px] transition focus:ring-4 focus:ring-login/15 outline-none focus:border-login"
          [attr.aria-invalid]="errs.has('pw')"
        />
        <p class="mt-1 text-[12px] text-[#4b5563]">
          At least 8 characters, with a letter and a number.
        </p>
        @if (errs.get('pw'); as m) {
          <p class="field-err">{{ m }}</p>
        }

        <label for="pw2" class="mb-1.5 mt-4 block text-[13px] font-semibold text-label"
          >Type the password again:</label
        >
        <input
          id="pw2"
          name="confirm"
          [type]="show() ? 'text' : 'password'"
          [(ngModel)]="confirm"
          (ngModelChange)="recheck()"
          autocomplete="new-password"
          maxlength="200"
          class="h-[44px] w-full rounded-xl border border-[#cfd8db] bg-white px-3.5 text-[15px] transition focus:ring-4 focus:ring-login/15 outline-none focus:border-login"
          [attr.aria-invalid]="errs.has('pw2')"
        />
        @if (errs.get('pw2'); as m) {
          <p class="field-err">{{ m }}</p>
        }
        <label class="mt-2 flex items-center gap-2 text-[13px]"
          ><input type="checkbox" [checked]="show()" (change)="show.set(!show())" /> Show
          password</label
        >

        <label class="mt-4 flex items-start gap-2 text-[13px]">
          <input
            id="consent"
            type="checkbox"
            name="consent"
            class="mt-[3px] h-[16px] w-[16px] shrink-0"
            [(ngModel)]="consent"
            (ngModelChange)="recheck()"
            [attr.aria-invalid]="errs.has('consent')"
          />
          <span
            >I agree that the Scholarship Office may keep and use my information to manage my
            scholarship (Data Privacy Act of 2012).</span
          >
        </label>
        @if (errs.get('consent'); as m) {
          <p class="field-err">{{ m }}</p>
        }

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
          {{ busy() ? 'ACTIVATING...' : 'SIGN UP' }}
        </button>
        <div class="mt-4 flex items-center justify-between text-[13px]">
          <a routerLink="/login" class="text-[#0b5cad] underline">← Back to log in</a>
          <span class="text-[#4b5563]">No Scholar ID? Ask the Scholarship Office.</span>
        </div>
      </form>
    </div>
  `,
})
export class SignUpPage {
  private auth = inject(AuthService);
  private dlg = inject(DialogService);
  private router = inject(Router);

  // The form values, bound to the inputs with [(ngModel)].
  scholarNumber = '';
  studentIdOrEmail = '';
  password = '';
  confirm = '';
  consent = false;
  show = signal(false);
  busy = signal(false);
  error = signal('');

  // Errors under each field. recheck() runs while typing after the first failed submit.
  errs = new FormErrors();
  recheck(): void {
    if (this.errs.attempted) this.errs.set(this.validate());
  }
  goTo(id: string): void {
    focusField(id);
  }

  // Same password rule as the API (ScholarRules.PasswordProblem), so mistakes show before sending.
  private validate(): FieldError[] {
    const e: FieldError[] = [];
    if (!this.scholarNumber.trim()) e.push({ id: 'sn', message: 'Please enter your Scholar ID.' });
    if (!this.studentIdOrEmail.trim())
      e.push({ id: 'sid', message: 'Please enter your Student ID or email.' });
    if (this.password.length < 8)
      e.push({ id: 'pw', message: 'Your password must be at least 8 characters long.' });
    else if (!/[A-Za-z]/.test(this.password) || !/\d/.test(this.password))
      e.push({
        id: 'pw',
        message: 'Your password must contain at least one letter and one number.',
      });
    if (this.confirm !== this.password)
      e.push({ id: 'pw2', message: 'The two passwords do not match.' });
    if (!this.consent) e.push({ id: 'consent', message: 'Please tick the data privacy consent.' });
    return e;
  }

  async submit(): Promise<void> {
    this.error.set('');
    const problems = this.validate();
    if (problems.length) {
      this.errs.attempted = true;
      this.errs.set(problems);
      setTimeout(() => focusField(problems[0].id));
      return;
    }
    this.errs.clear();
    this.busy.set(true);
    try {
      const user = await this.auth.signUp({
        scholarNumber: this.scholarNumber.trim(),
        studentIdOrEmail: this.studentIdOrEmail.trim(),
        password: this.password,
      });
      await this.dlg.success(
        `Your account is ready, ${user.name}!\n\nNext time, log in with your username: ${user.username}\nand the password you just chose.`,
        'Account activated',
      );
      await this.router.navigateByUrl(this.auth.homeRoute());
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
