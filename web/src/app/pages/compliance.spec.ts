import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ScholarCompliancePage } from './scholar/compliance';
import { ComplianceItem } from '../core/models';

const item = (id: number, status: string): ComplianceItem => ({ id, requirementType: `Req ${id}`, description: null, dueDate: '2026-12-20', dateSubmitted: null, status, remarks: null, checkedBy: null, fileCount: 0, fileName: null });

describe('ScholarCompliancePage', () => {
  const setup = async () => {
    TestBed.configureTestingModule({ imports: [ScholarCompliancePage], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fx = TestBed.createComponent(ScholarCompliancePage);
    fx.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/scholar/compliance')
      .flush({ items: [item(1, 'Pending'), item(2, 'Approved'), item(3, 'Rejected')], total: 3, completed: 1, pending: 1, overdue: 0, rate: 33 });
    await fx.whenStable(); fx.detectChanges();
    return { fx, c: fx.componentInstance, el: fx.nativeElement as HTMLElement };
  };

  it('offers upload only for Pending and Rejected requirements (as the desktop form did)', async () => {
    const { fx, c, el } = await setup();
    for (const [id, shows] of [[1, true], [2, false], [3, true]] as const) {
      c.sel.set(c.data()!.items.find((i) => i.id === id)!); fx.detectChanges();
      expect(!!el.querySelector('aside input[type=file]')).toBe(shows);
    }
    // The list also offers an inline Upload button, only on rows that can still be uploaded.
    expect(el.querySelectorAll('tbody input[type=file]').length).toBe(2);
  });

  it('filters by status', async () => {
    const { c } = await setup();
    c.status = 'Approved';
    expect(c.filtered().map((i) => i.id)).toEqual([2]);
  });

  it('shows the compliance rate', async () => {
    const { el } = await setup();
    expect(el.textContent).toContain('33%');
  });
});
