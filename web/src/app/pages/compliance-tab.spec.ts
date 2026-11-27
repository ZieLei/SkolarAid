import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComplianceTab } from './admin/compliance-tab';
import { ComplianceOverviewItem } from '../core/models';

const row = (id: number, scholarId: number, name: string, status: string): ComplianceOverviewItem => ({
  id, scholarId, scholarName: name, scholarNumber: `SCH-${scholarId}`, requirementType: 'COR', description: null, dueDate: '2026-12-20',
  dateSubmitted: null, status, remarks: null, checkedBy: null, fileCount: 0, fileName: null,
});

describe('ComplianceTab (admin)', () => {
  it('shows every scholar\'s requirements before a scholar is picked, and filters by status', async () => {
    TestBed.configureTestingModule({ imports: [ComplianceTab], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fx = TestBed.createComponent(ComplianceTab);
    fx.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/compliance/scholars').flush([]);
    http.expectOne((r) => r.url === '/api/admin/compliance').flush([row(1, 10, 'Ana Lim', 'Submitted'), row(2, 11, 'Ben Cruz', 'Pending')]);
    await fx.whenStable(); fx.detectChanges();
    const el = fx.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Ana Lim');
    expect(el.textContent).toContain('Ben Cruz');
    expect(el.querySelectorAll('tbody tr').length).toBe(2);

    fx.componentInstance.allStatus.set('Submitted'); void fx.componentInstance.loadAll();
    const req = http.expectOne((r) => r.url === '/api/admin/compliance');
    expect(req.request.params.get('status')).toBe('Submitted');
    req.flush([row(1, 10, 'Ana Lim', 'Submitted')]);
    await fx.whenStable(); fx.detectChanges();
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
  });
});
