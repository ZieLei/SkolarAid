import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from './auth';
import { roleGuard } from './http';
import { LoginResponse } from './models';

const adminLogin: LoginResponse = { token: 't0k', expiresAt: new Date(Date.now() + 3_600_000).toISOString(), user: { id: 1, username: 'admin', role: 'ADMIN', name: 'Admin', scholarId: null, scholarNumber: null } };

describe('AuthService and guards', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });

  it('stores the session after login and exposes the role', async () => {
    const auth = TestBed.inject(AuthService);
    const p = auth.login('admin', 'pw');
    const req = http.expectOne('/api/auth/login');
    expect(req.request.body).toEqual({ username: 'admin', password: 'pw' });
    req.flush(adminLogin);
    await p;
    expect(auth.isAdmin()).toBe(true);
    expect(auth.homeRoute()).toBe('/admin/dashboard');
    expect(localStorage.getItem('skolaraid.session')).toContain('t0k');
  });

  it('ignores an expired stored session', () => {
    localStorage.setItem('skolaraid.session', JSON.stringify({ ...adminLogin, expiresAt: new Date(Date.now() - 1000).toISOString() }));
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(false);
  });

  it('sends anonymous users to /login and scholars away from admin routes', async () => {
    const router = TestBed.inject(Router);
    const guard = roleGuard('ADMIN');
    const run = () => TestBed.runInInjectionContext(() => guard({} as never, {} as never));
    expect(router.serializeUrl(run() as never)).toBe('/login');

    const auth = TestBed.inject(AuthService);
    const p = auth.login('s', 'pw');
    http.expectOne('/api/auth/login').flush({ ...adminLogin, user: { ...adminLogin.user, role: 'SCHOLAR', scholarId: 4 } });
    await p;
    expect(router.serializeUrl(run() as never)).toBe('/scholar/dashboard');
  });
});
