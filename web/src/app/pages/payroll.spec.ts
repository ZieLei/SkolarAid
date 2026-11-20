import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PayrollPage } from './admin/payroll';
import { PayrollCandidate } from '../core/models';

const row = (id: number, amount: number, eligible: boolean): PayrollCandidate => ({ id, scholarNumber: `SCH-${id}`, fullName: `Scholar ${id}`, course: 'C', yearLevel: '1st Year', scholarshipType: 'T', stipendAmount: amount, complianceStatus: eligible ? 'Complete' : 'Pending Approval', paymentStatus: 'Not Paid', isEligible: eligible });

describe('PayrollPage', () => {
  const setup = async () => {
    TestBed.configureTestingModule({ imports: [PayrollPage], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fx = TestBed.createComponent(PayrollPage);
    fx.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/scholars/filters').flush({ statuses: [], scholarships: [], courses: [] });
    await fx.whenStable();
    http.expectOne((r) => r.url === '/api/admin/payroll/candidates').flush([row(1, 5000, true), row(2, 3500, true), row(3, 9000, false)]);
    http.expectOne((r) => r.url === '/api/admin/payroll/history').flush([]);
    http.expectOne('/api/admin/payroll/stats').flush({ processedToday: 0, readyForRelease: 0, readyAmount: 0 });
    await fx.whenStable(); fx.detectChanges();
    return { fx, c: fx.componentInstance, el: fx.nativeElement as HTMLElement };
  };

  it('Select All Eligible picks only eligible scholars and totals their stipends', async () => {
    const { fx, c, el } = await setup();
    c.selectAll(); fx.detectChanges();
    expect([...c.selected()].sort()).toEqual([1, 2]);
    expect(c.total()).toBe(8500);
    expect(el.textContent).toContain('Selected Scholars: 2');
    expect(el.textContent).toContain('₱8,500.00');
  });

  it('disables the checkbox of ineligible scholars and the process button with nothing selected', async () => {
    const { fx, el } = await setup();
    const boxes = el.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]');
    expect(boxes[2].disabled).toBe(true);
    const process = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Process Payroll'))!;
    expect(process.disabled).toBe(true);
    fx.componentInstance.toggle(1); fx.detectChanges();
    expect(process.disabled).toBe(false);
  });
});
