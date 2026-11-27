// =====================================================================
// auth.ts - who is logged in (on the browser side).
//
// Login flow:
// LoginPage -> auth.login() -> POST /api/auth/login
// -> save {token, user} in localStorage (stays after refresh)
// -> LoginPage goes to auth.homeRoute()
// Logout: tell the API, clear localStorage, go to /login.
//
// Values are Angular "signals": when they change, every screen that
// reads them (sidebar name, guards...) updates by itself.
// =====================================================================
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from './api';
import { LoginResponse, SignUpRequest, UserInfo } from './models';

// localStorage key where the session is kept.
const KEY = 'iskolaraid.session';

interface Session { token: string; expiresAt: string; user: UserInfo; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(Api);
  private router = inject(Router);
  private session = signal<Session | null>(this.load());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);
  readonly isLoggedIn = computed(() => !!this.session());
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  readonly isScholar = computed(() => this.user()?.role === 'SCHOLAR');

  // On page load: read the saved session. Ignore it if the token has expired.
  private load(): Session | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as Session;
      return new Date(s.expiresAt).getTime() > Date.now() ? s : null;
    } catch { return null; }
  }

  async login(username: string, password: string): Promise<UserInfo> {
    return this.start(await firstValueFrom(this.api.post<LoginResponse>('/auth/login', { username, password })));
  }

  /** Sign-up (activate an account the admin created) and log in straight away. */
  async signUp(req: SignUpRequest): Promise<UserInfo> {
    return this.start(await firstValueFrom(this.api.post<LoginResponse>('/auth/signup', req)));
  }

  /** Save a new session (from login or sign-up). */
  private start(res: LoginResponse): UserInfo {
    const s: Session = { token: res.token, expiresAt: res.expiresAt, user: res.user };
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable: keep in memory */ }
    this.session.set(s);
    return res.user;
  }

  // Where to go after login: admin dashboard or scholar dashboard.
  homeRoute(): string { return this.isAdmin() ? '/admin/dashboard' : '/scholar/dashboard'; }

  // callApi = false is used when the server already said the token is bad (401).
  async logout(callApi = true): Promise<void> {
    if (callApi && this.isLoggedIn()) { try { await firstValueFrom(this.api.post('/auth/logout')); } catch { /* ignore */ } }
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    this.session.set(null);
    await this.router.navigateByUrl('/login');
  }
}
