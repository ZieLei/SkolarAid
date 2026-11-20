import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Chart } from 'chart.js';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, PesoPipe, daysAgo, today, formatPeso } from '../../core/format';
import { Analytics, Receipt, ReleasedPayment, ReportResult, ScholarFilters } from '../../core/models';
import { Modal } from '../../shared/modal';
import { barConfig, lineConfig, makeChart, pieConfig } from '../../shared/charts';
import { TEMPLATE_ICONS, TEMPLATE_LIST, printHtml, receiptHtml, reportHtml, templateHtml } from '../../shared/print';
import { AppIcon } from '../../shared/icon';
import { ScrollCue } from '../../shared/scroll-cue';

@Component({
  selector: 'app-reports',
  imports: [ScrollCue, AppIcon, FormsModule, Modal, PesoPipe, DatePipeShort],
  template: `
    <div class="mb-4 flex gap-1 border-b-2 border-[#d9d9d9]">
      @for (t of tabs; track t.id) {
        <button class="rounded-t-lg px-5 py-2 text-[14px] font-bold" [class.bg-accent]="tab() === t.id" [class.text-white]="tab() === t.id" [class.text-label]="tab() !== t.id" (click)="switchTab(t.id)">{{ t.label }}</button>
      }
    </div>

    @if (tab() === 'reports') {
      <div class="grid gap-4 xl:grid-cols-[1fr_330px]">
        <section class="card p-5">
          <div class="mb-3 flex flex-wrap items-end gap-4">
            <div><label class="field-label-b">Report Type:</label><select class="input !w-[230px]" [(ngModel)]="q.type">@for (t of reportTypes(); track t) { <option>{{ t }}</option> }</select></div>
            <div><label class="field-label-b">Date Range:</label><div class="flex items-center gap-2"><input class="input !w-[130px]" type="date" [(ngModel)]="q.from" /> to <input class="input !w-[130px]" type="date" [(ngModel)]="q.to" /></div></div>
          </div>
          <div class="mb-4 flex flex-wrap items-end gap-3">
            <span class="pb-1 text-[13px] font-bold">Filter Options:</span>
            <select class="input !w-[200px]" [(ngModel)]="q.course"><option>All Courses</option>@for (c of filters()?.courses ?? []; track c) { <option>{{ c }}</option> }</select>
            <select class="input !w-[180px]" [(ngModel)]="q.scholarship"><option>All Scholarships</option>@for (s of filters()?.scholarships ?? []; track s.id) { <option>{{ s.name }}</option> }</select>
            <select class="input !w-[150px]" [(ngModel)]="q.status"><option>All Status</option>@for (s of filters()?.statuses ?? []; track s) { <option>{{ s }}</option> }</select>
            <div class="ml-auto flex gap-2">
              <button class="btn btn-accent" [disabled]="busy()" (click)="generate()">Generate Report</button>
              <button class="btn btn-accent" (click)="exportPdf()">Export PDF</button>
              <button class="btn btn-ok" (click)="exportCsv()">Export Excel</button>
              <button class="btn" style="background:#646464" (click)="exportPdf()">Print</button>
            </div>
          </div>
          <div scrollCue class="grid-wrap max-h-[560px] rounded border border-[#e6e6e6]">
            @if (report(); as r) {
              <table class="dgrid">
                <thead><tr>@for (c of r.columns; track c) { <th>{{ c }}</th> }</tr></thead>
                <tbody>@for (row of r.rows; track $index; let i = $index) { <tr [class.alt]="i % 2 === 1">@for (cell of row; track $index) { <td>{{ cell }}</td> }</tr> } @empty { <tr><td [attr.colspan]="r.columns.length" class="!py-8 text-center text-[#595959]">No records found</td></tr> }</tbody>
              </table>
            } @else { <p class="p-10 text-center text-[13px] text-[#595959]">Choose a report type and press “Generate Report”.</p> }
          </div>
        </section>

        <aside class="card p-5">
          <h2 class="mb-1 text-[14pt] font-bold text-accent">Blank forms to print</h2>
          <p class="mb-3 text-[12px] text-[#444]">Empty forms to print and fill in by hand. (To get a report with your data, use the report builder on the left.)</p>
          @for (t of templates; track t) { <button class="mb-2 w-full rounded bg-brand px-3 py-2 text-left text-[13px] text-white hover:bg-brand-hover" (click)="printTemplate(t)"><app-icon [name]="icons[t]" class="mr-2 inline-flex h-4 w-4 align-[-3px]"></app-icon>{{ t }}</button> }
          <hr class="my-3" />
          <h2 class="mb-2 text-[14pt] font-bold text-accent">Disbursement receipt</h2>
          <button class="btn btn-ok w-full !h-[40px]" (click)="openReceipts()"><app-icon name="invoice" class="h-4 w-4"></app-icon>Choose a payment to print…</button>
        </aside>
      </div>
    } @else {
      <div class="card mb-4 flex flex-wrap items-center gap-5 p-5">
        @for (c of statCards(); track c.label) {
          <div class="flex min-w-[220px] flex-1 items-center gap-3 rounded-lg border border-[#eee] p-3">
            <app-icon [name]="c.icon" class="card-icon h-[50px] w-[50px]"></app-icon>
            <div><p class="text-[28px] font-bold leading-none" [style.color]="c.color">{{ c.value }}</p><p class="mt-1 text-[10pt] font-bold text-gray-500">{{ c.label }}</p></div>
          </div>
        }
        <button class="btn btn-accent self-end" (click)="loadAnalytics()">Refresh</button>
      </div>
      <section class="card p-5">
        <h2 class="mb-3 text-[16pt] font-bold text-accent">Analytics Charts</h2>
        <div class="grid gap-5 lg:grid-cols-3">
          <div class="rounded-lg border border-[#eee] p-3"><h3 class="mb-2 text-[12pt] font-bold">Scholars by Scholarship Type</h3><div class="h-[320px]"><canvas #c1></canvas></div></div>
          <div class="rounded-lg border border-[#eee] p-3"><h3 class="mb-2 text-[12pt] font-bold">Scholars by Course</h3><div class="h-[320px]"><canvas #c2></canvas></div></div>
          <div class="rounded-lg border border-[#eee] p-3"><h3 class="mb-2 text-[12pt] font-bold">Monthly Disbursements</h3><div class="h-[320px]"><canvas #c3></canvas></div></div>
        </div>
      </section>
    }

    @if (receiptsOpen()) {
      <app-modal title="Which released payment do you want a receipt for?" [width]="760" (closed)="receiptsOpen.set(false)">
        <div scrollCue class="grid-wrap max-h-[420px] rounded border border-[#e6e6e6]">
          <table class="dgrid"><thead><tr><th>ID</th><th>Scholar #</th><th>Scholar Name</th><th>Period</th><th>Amount</th><th>Release Date</th><th></th></tr></thead>
            <tbody>@for (p of released(); track p.id; let i = $index) {
              <tr [class.alt]="i % 2 === 1"><td>{{ p.id }}</td><td>{{ p.scholarNumber }}</td><td>{{ p.scholarName }}</td><td>{{ p.period }}</td><td>{{ p.amount | peso }}</td><td>{{ p.releaseDate | dmy }}</td>
                <td><button class="btn btn-ok !h-[26px] !px-3 !text-[12px]" (click)="printReceipt(p.id)" [attr.aria-label]="'Print receipt for ' + p.scholarName + ', ' + p.period">Print receipt</button></td></tr>
            } @empty { <tr><td colspan="7" class="!py-6 text-center text-[#595959]">No released payments yet</td></tr> }</tbody></table>
        </div>
      </app-modal>
    }
  `,
})
export class ReportsPage implements OnInit, OnDestroy {
  private api = inject(Api);
  private dlg = inject(DialogService);
  private c1 = viewChild<ElementRef<HTMLCanvasElement>>('c1');
  private c2 = viewChild<ElementRef<HTMLCanvasElement>>('c2');
  private c3 = viewChild<ElementRef<HTMLCanvasElement>>('c3');
  private charts: Chart[] = [];

  tabs = [{ id: 'reports', label: 'Generate Reports' }, { id: 'analytics', label: 'Analytics Dashboard' }] as const;
  tab = signal<'reports' | 'analytics'>('reports');
  filters = signal<ScholarFilters | null>(null);
  reportTypes = signal<string[]>([]);
  report = signal<ReportResult | null>(null);
  analytics = signal<Analytics | null>(null);
  released = signal<ReleasedPayment[]>([]);
  receiptsOpen = signal(false);
  busy = signal(false);
  templates = TEMPLATE_LIST; icons = TEMPLATE_ICONS;
  q = { type: 'Scholar Census Report', from: daysAgo(365), to: today(), course: 'All Courses', scholarship: 'All Scholarships', status: 'All Status' };

  statCards = computed(() => {
    const s = this.analytics()?.stats;
    return [
      { label: 'Total Scholars', value: String(s?.totalScholars ?? 0), icon: 'user-groups', color: '#0a5c5c' },
      { label: 'Active Scholars', value: String(s?.totalScholars ?? 0), icon: 'checked', color: '#17692c' },
      { label: 'Total Disbursed', value: formatPeso(s?.totalDisbursed), icon: 'wallet', color: '#ffc107' },
      { label: 'Pending Payments', value: String(s?.pendingPayments ?? 0), icon: 'wall-clock', color: '#b42318' },
    ];
  });

  async ngOnInit(): Promise<void> {
    try {
      const [f, t] = await Promise.all([firstValueFrom(this.api.get<ScholarFilters>('/admin/scholars/filters')), firstValueFrom(this.api.get<string[]>('/admin/reports/types'))]);
      this.filters.set(f); this.reportTypes.set(t);
    } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
  ngOnDestroy(): void { this.charts.forEach((c) => c.destroy()); }

  private params() { return { type: this.q.type, from: this.q.from, to: this.q.to, course: this.q.course, scholarship: this.q.scholarship, status: this.q.status }; }

  async generate(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.get<ReportResult>('/admin/reports/generate', this.params()));
      this.report.set(r);
      void this.dlg.success(`Report generated successfully!\n\nTotal Records: ${r.rows.length}`, 'Report Generated');
    } catch (e) { void this.dlg.error(errorMessage(e), 'Error generating report'); } finally { this.busy.set(false); }
  }

  async exportCsv(): Promise<void> { try { await this.api.download('/admin/reports/csv', this.params(), 'Report.csv'); } catch (e) { void this.dlg.error(errorMessage(e), 'Export Excel'); } }

  exportPdf(): void {
    const r = this.report();
    if (!r || !r.rows.length) { void this.dlg.warning('No data to export.', 'Export'); return; }
    printHtml(r.title, reportHtml(r.title, r.columns, r.rows));
  }

  printTemplate(name: string): void { printHtml(name, templateHtml(name)); }

  async openReceipts(): Promise<void> {
    try { this.released.set(await firstValueFrom(this.api.get<ReleasedPayment[]>('/admin/reports/released-payments'))); this.receiptsOpen.set(true); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
  async printReceipt(id: number): Promise<void> {
    try { const r = await firstValueFrom(this.api.get<Receipt>(`/admin/reports/receipts/${id}`)); printHtml('Receipt ' + r.referenceNumber, receiptHtml(r)); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  switchTab(t: 'reports' | 'analytics'): void { this.tab.set(t); if (t === 'analytics') setTimeout(() => void this.loadAnalytics()); }

  async loadAnalytics(): Promise<void> {
    try {
      const a = await firstValueFrom(this.api.get<Analytics>('/admin/reports/analytics'));
      this.analytics.set(a);
      this.charts.forEach((c) => c.destroy()); this.charts = [];
      setTimeout(async () => {
        const [e1, e2, e3] = [this.c1()?.nativeElement, this.c2()?.nativeElement, this.c3()?.nativeElement];
        if (e1) this.charts.push(await makeChart(e1, pieConfig(a.byScholarship.map((x) => x.label), a.byScholarship.map((x) => x.value))));
        if (e2) this.charts.push(await makeChart(e2, barConfig(a.byCourse.map((x) => x.label), a.byCourse.map((x) => x.value))));
        if (e3) this.charts.push(await makeChart(e3, lineConfig(a.monthlyDisbursement.map((x) => x.label), a.monthlyDisbursement.map((x) => x.value))));
      });
    } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
}
