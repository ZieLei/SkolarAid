import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from './api';
import { LoginResponse, UserInfo } from './models';

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

  private load(): Session | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as Session;
      return new Date(s.expiresAt).getTime() > Date.now() ? s : null;
    } catch { return null; }
  }

  async login(username: string, password: string): Promise<UserInfo> {
    const res = await firstValueFrom(this.api.post<LoginResponse>('/auth/login', { username, password }));
    const s: Session = { token: res.token, expiresAt: res.expiresAt, user: res.user };
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable: keep in memory */ }
    this.session.set(s);
    return res.user;
  }

  homeRoute(): string { return this.isAdmin() ? '/admin/dashboard' : '/scholar/dashboard'; }

  async logout(callApi = true): Promise<void> {
    if (callApi && this.isLoggedIn()) { try { await firstValueFrom(this.api.post('/auth/logout')); } catch { /* ignore */ } }
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    this.session.set(null);
    await this.router.navigateByUrl('/login');
  }
}
