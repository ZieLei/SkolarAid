import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DialogService } from '../core/dialog';
import { RegisterPage } from './register';

const types = [{ id: 7, name: 'Academic', description: null, stipendAmount: 5000, paymentFrequency: 'Monthly', fundSource: 'Government', renewalConditions: 'GPA 2.5', isActive: true, scholarCount: 0 }];

describe('RegisterPage', () => {
  const setup = async () => {
    TestBed.configureTestingModule({ imports: [RegisterPage], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    const fx = TestBed.createComponent(RegisterPage);
    fx.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/scholarship-types/active').flush(types);
    await fx.whenStable(); fx.detectChanges();
    return { fx, el: fx.nativeElement as HTMLElement, http, c: fx.componentInstance };
  };

  const fill = (c: RegisterPage) => Object.assign(c.m, { studentId: '2026-1', firstName: 'Ana', lastName: 'Lim', email: 'ana@x.ph', contactNumber: '0917', gender: 'Female', degreeProgram: 'Bachelor of Science in Criminology', yearLevel: '1st Year', scholarshipTypeId: 7 });

  it('loads active scholarship types and auto-fills the stipend details on selection', async () => {
    const { fx, el, c } = await setup();
    const sel = el.querySelector<HTMLSelectElement>('select[name=type]')!;
    sel.selectedIndex = 1; sel.dispatchEvent(new Event('change')); // choose the first scholarship type like a user would
    await fx.whenStable(); fx.detectChanges();
    expect(c.m.scholarshipTypeId).toBe(7);
    expect(el.textContent).toContain('Scholarship Details (Auto-Filled)');
    expect(el.textContent).toContain('₱5,000.00');
    expect(el.textContent).toContain('GPA 2.5');
  });

  it('requires the PSA, COE and COR uploads (original validation order and wording)', async () => {
    const { fx, el, http, c } = await setup();
    fill(c);
    await c.submit(); fx.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Please upload your PSA Birth Certificate.');
    http.expectNone('/api/registrations');
  });

  it('rejects an invalid email before submitting', async () => {
    const { fx, el, c } = await setup();
    fill(c); c.m.email = 'not-an-email';
    await c.submit(); fx.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('valid Email');
  });

  it('posts multipart form data with the documents when everything is valid', async () => {
    const { http, c } = await setup();
    fill(c);
    c.docs.update((ds) => ds.map((d) => ({ ...d, file: d.required ? new File(['x'], `${d.key}.pdf`) : null })));
    const p = c.submit();
    const req = http.expectOne('/api/registrations');
    const fd = req.request.body as FormData;
    expect(fd.get('StudentId')).toBe('2026-1');
    expect(fd.get('ScholarshipTypeId')).toBe('7');
    expect((fd.get('psa') as File).name).toBe('psa.pdf');
    req.flush({ id: 1 });
    await vi.waitFor(() => expect(TestBed.inject(DialogService).current()).not.toBeNull());
    TestBed.inject(DialogService).close(true); // dismiss the success dialog
    await p;
  });
});
