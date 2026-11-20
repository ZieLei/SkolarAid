import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { LoginPage } from './login';

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [LoginPage], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
  });

  const setup = () => {
    const fx = TestBed.createComponent(LoginPage);
    fx.detectChanges();
    return { fx, el: fx.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
  };

  it('shows the original heading and a LOG IN button', () => {
    const { el } = setup();
    expect(el.textContent).toContain('Welcome back to IskolarAid');
    expect(el.querySelector('button[type=submit]')?.textContent).toContain('LOG IN');
  });

  it('asks for both fields before calling the API', async () => {
    const { fx, el, http } = setup();
    await fx.componentInstance.submit();
    fx.detectChanges();
    expect(el.textContent).toContain('Please enter Student ID and Password.');
    http.expectNone('/api/auth/login');
  });

  it('shows the server message on a failed login', async () => {
    const { fx, el, http } = setup();
    fx.componentInstance.username = '2026-000001'; fx.componentInstance.password = 'bad';
    const p = fx.componentInstance.submit();
    http.expectOne('/api/auth/login').flush({ title: 'Invalid Student ID or Password.' }, { status: 401, statusText: 'Unauthorized' });
    await p; fx.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Invalid Student ID or Password.');
  });

  it('navigates to the admin dashboard after an admin signs in', async () => {
    const { fx, http } = setup();
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fx.componentInstance.username = 'admin'; fx.componentInstance.password = 'pw';
    const p = fx.componentInstance.submit();
    http.expectOne('/api/auth/login').flush({ token: 'x', expiresAt: new Date(Date.now() + 60_000).toISOString(), user: { id: 1, username: 'admin', role: 'ADMIN', name: 'Admin', scholarId: null, scholarNumber: null } });
    await p;
    expect(nav).toHaveBeenCalledWith('/admin/dashboard');
  });
});
