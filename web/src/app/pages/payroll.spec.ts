import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PayrollPage, defaultReleaseDate, periodLabel } from './admin/payroll';
import { PayrollCandidate } from '../core/models';

const row = (id: number, amount: number, eligible: boolean): PayrollCandidate => ({ id, scholarNumber: `SCH-${id}`, fullName: `Scholar ${id}`, course: 'C', yearLevel: '1st Year', scholarshipType: 'T', stipendAmount: amount, complianceStatus: eligible ? 'Complete' : 'Pending Approval', paymentStatus: 'Not Paid', isEligible: eligible, payoutProblem: null, frequency: 'Monthly', cycleProblem: null });

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
    expect(el.textContent).toMatch(/2 selected/);
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

  it('labels periods the same way the API saves them', () => {
    expect(periodLabel('2026-03-01', '2026-03-31')).toBe('March 2026');
    expect(periodLabel('2026-03-01', '2026-03-15')).toBe('Mar 01-15, 2026');
    expect(periodLabel('2026-03-16', '2026-04-15')).toBe('Mar 16 - Apr 15, 2026');
    expect(periodLabel('2026-12-16', '2027-01-15')).toBe('Dec 16, 2026 - Jan 15, 2027');
  });

  it('a pay-cycle button fills From / To for that frequency and reloads the table', async () => {
    const { c } = await setup();
    const http = TestBed.inject(HttpTestingController);
    c.setPeriod('2026-03-10', '2026-03-20');
    http.expectOne((r) => r.url === '/api/admin/payroll/candidates').flush([]);
    http.expectOne((r) => r.url === '/api/admin/payroll/history').flush([]);
    const ranges: [Parameters<typeof c.applyPreset>[0], string, string][] = [
      ['month', '2026-03-01', '2026-03-31'], ['quarter', '2026-01-01', '2026-03-31'], ['semester', '2026-01-01', '2026-06-30'], ['year', '2026-01-01', '2026-12-31'],
    ];
    for (const [id, from, to] of ranges) {
      c.setPeriod('2026-03-10', '2026-03-20');
      http.match((r) => r.url === '/api/admin/payroll/candidates').forEach((r) => r.flush([]));
      http.match((r) => r.url === '/api/admin/payroll/history').forEach((r) => r.flush([]));
      c.applyPreset(id);
      const req = http.expectOne((r) => r.url === '/api/admin/payroll/candidates');
      expect([req.request.params.get('from'), req.request.params.get('to')]).toEqual([from, to]);
      req.flush([]);
      http.expectOne((r) => r.url === '/api/admin/payroll/history').flush([]);
    }
    expect(c.periodLabel()).toBe('Jan 01 - Dec 31, 2026');
    expect(c.presets.map((p) => p.label)).toEqual(['Monthly', 'Quarterly', 'Semi-Annual', 'Annual']);
  });

  it('the default expected release date is 3 working days away, skipping the weekend', () => {
    expect(defaultReleaseDate(new Date(2026, 10, 23))).toBe('2026-11-26'); // Mon -> Thu
    expect(defaultReleaseDate(new Date(2026, 10, 25))).toBe('2026-11-30'); // Wed -> Sat -> Mon
    expect(defaultReleaseDate(new Date(2026, 10, 27))).toBe('2026-11-30'); // Fri -> Mon
    expect(defaultReleaseDate(new Date(2026, 11, 3))).toBe('2026-12-07');  // Thu -> Sun -> Mon
  });

  it('a scholar on another pay cycle is told what period they need', async () => {
    const { fx, c, el } = await setup();
    const semester = { ...row(4, 13500, false), complianceStatus: 'Complete', frequency: 'Semi-Annual', cycleProblem: 'paid Semi-Annual: needs a 6-month period' };
    c.rows.set([row(1, 5000, true), semester]);
    fx.detectChanges();
    expect(c.reason(semester)).toBe('paid Semi-Annual: needs a 6-month period');
    expect(el.textContent).toContain('Semi-Annual');
    expect(el.textContent).toContain('paid Semi-Annual: needs a 6-month period');
  });

  it('a period that has not started yet shows a notice', async () => {
    const { fx, c, el } = await setup();
    const next = new Date(); next.setDate(next.getDate() + 5);
    const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    c.periodStart.set(iso); c.periodEnd.set(iso);
    fx.detectChanges();
    expect(c.notStarted()).toBe(true);
    expect(el.textContent).toContain('nobody can be paid for it yet');
  });

  it('Change date moves a processed payment and refreshes the history', async () => {
    const { c } = await setup();
    const http = TestBed.inject(HttpTestingController);
    c.openReschedule(77, 'Scholar 1', 'November 2026', '2026-11-20T00:00:00');
    expect(c.reschedule()?.id).toBe(77);
    c.newDate = c.todayIso;
    const done = c.runReschedule();
    const req = http.expectOne('/api/admin/payroll/payments/77/reschedule');
    expect(req.request.body).toEqual({ releaseDate: c.todayIso });
    req.flush({});
    await Promise.resolve();
    http.expectOne((r) => r.url === '/api/admin/payroll/history').flush([]);
    http.expectOne('/api/admin/payroll/stats').flush({ processedToday: 0, readyForRelease: 0, readyAmount: 0 });
    await done;
    expect(c.reschedule()).toBeNull();
  });

  it('changing the payment method re-checks the table, and Bank Transfer blocks scholars with no bank details', async () => {
    const { fx, c, el } = await setup();
    const http = TestBed.inject(HttpTestingController);
    c.setMethod('Bank Transfer');
    const req = http.expectOne((r) => r.url === '/api/admin/payroll/candidates');
    expect(req.request.params.get('method')).toBe('Bank Transfer');
    // With Bank Transfer the API marks scholar 2 as blocked, and says why.
    const blocked = { ...row(2, 3500, false), complianceStatus: 'Complete', payoutProblem: 'no bank details' };
    // Scholar 3 is blocked only because compliance is not approved, so the bank notice does not count them.
    req.flush([row(1, 5000, true), blocked, { ...row(3, 9000, false), payoutProblem: 'no bank details' }]);
    await fx.whenStable(); fx.detectChanges();
    expect(c.noBankCount()).toBe(1);
    expect(c.reason(blocked)).toBe('no bank details (needed for Bank Transfer)');
    expect(el.textContent).toContain('1 scholar has no bank details');
  });
});
