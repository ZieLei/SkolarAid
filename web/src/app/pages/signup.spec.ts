import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DialogService } from '../core/dialog';
import { SignUpPage } from './signup';

describe('SignUpPage', () => {
  const setup = async () => {
    TestBed.configureTestingModule({ imports: [SignUpPage], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    const fx = TestBed.createComponent(SignUpPage);
    fx.detectChanges();
    await fx.whenStable();
    return { fx, el: fx.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController), c: fx.componentInstance };
  };

  it('is a sign-up for existing scholars, not a scholarship application', async () => {
    const { el } = await setup();
    expect(el.textContent).toContain('Scholar ID');
    expect(el.textContent).not.toContain('Apply');
    expect(el.querySelector('a[aria-label^="Close"]')).toBeTruthy(); // exit button back to log in
  });

  it('checks the password rule and the confirmation before calling the API', async () => {
    const { fx, el, http, c } = await setup();
    Object.assign(c, { scholarNumber: 'SCH-2026-001', studentIdOrEmail: 'ana@x.ph', password: 'password', confirm: 'nope', consent: true });
    await c.submit(); fx.detectChanges();
    const alert = el.querySelector('[role=alert]')?.textContent ?? '';
    expect(alert).toContain('at least one letter and one number');
    expect(alert).toContain('do not match');
    http.expectNone('/api/auth/signup');
  });

  it('sends the Scholar ID, Student ID or email and password, then shows the username', async () => {
    const { http, c } = await setup();
    const dlg = TestBed.inject(DialogService);
    Object.assign(c, { scholarNumber: ' sch-2026-001 ', studentIdOrEmail: 'ana@x.ph', password: 'Scholar2026', confirm: 'Scholar2026', consent: true });
    const done = c.submit();
    const req = http.expectOne('/api/auth/signup');
    expect(req.request.body).toEqual({ scholarNumber: 'sch-2026-001', studentIdOrEmail: 'ana@x.ph', password: 'Scholar2026' });
    req.flush({ token: 't', expiresAt: new Date(Date.now() + 60_000).toISOString(), user: { id: 1, username: '2026-000001', role: 'SCHOLAR', name: 'Ana Lim', scholarId: 1, scholarNumber: 'SCH-2026-001' } });
    await new Promise((r) => setTimeout(r));
    expect(dlg.current()?.message).toContain('2026-000001');
    dlg.close(true);
    await done;
  });
});
