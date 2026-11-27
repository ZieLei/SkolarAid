// =====================================================================
// reports.ts - Admin > Reports & Analytics (/admin/reports).
//
// Tab "Reports":
//   1. pick a report (cards)  2. set its filters (only the ones that report uses)
//   3. generate() -> GET /api/admin/reports/generate -> results table
//   then export it: Print / PDF (exportPdf), Excel (exportCsv), Word (exportDocx).
//   Side panel: blank forms to print or download (printTemplate / templateDocx)
//   and payment receipts (openReceipts -> printReceipt / receiptDocx).
// Tab "Analytics":
//   loadAnalytics() -> GET /api/admin/reports/analytics -> summary + 3 charts.
// API: ReportsController -> ReportService / DashboardService.
// Printing helpers are in shared/print.ts, chart settings in shared/charts.ts.
// =====================================================================
import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Chart } from 'chart.js';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { ToastService } from '../../core/toast';
import { DatePipeShort, PesoPipe, daysAgo, today, formatPeso } from '../../core/format';
import { Analytics, Receipt, ReleasedPayment, ReportResult, ScholarFilters } from '../../core/models';
import { Modal } from '../../shared/modal';
import { CHART_COLORS, barConfig, doughnutConfig, lineConfig, makeChart } from '../../shared/charts';
import { TEMPLATE_ICONS, TEMPLATE_LIST, printHtml, receiptHtml, reportHtml, templateDef, templateHtml } from '../../shared/print';
import { AppIcon } from '../../shared/icon';
import { ScrollCue } from '../../shared/scroll-cue';
import { StatItem, StatStrip } from '../../shared/stat-strip';

type Filter = 'date' | 'course' | 'scholarship' | 'status';
interface ReportForm { type: string; from: string; to: string; course: string; scholarship: string; status: string; }
interface ReportInfo { icon: string; text: string; filters: Filter[]; dateLabel?: string; }

/**
 * What each report shows and which filters it really uses (see ReportService.GenerateAsync).
 * Only those filters are shown, so nobody sets a filter that is silently ignored.
 */
const REPORTS: Record<string, ReportInfo> = {
  'Scholar Census Report': { icon: 'user-groups', text: 'Every scholar with course, year level, scholarship and status.', filters: ['date', 'course', 'scholarship', 'status'], dateLabel: 'Added between' },
  'Payroll Summary Report': { icon: 'money', text: 'Payments per period: how many, how much and their status.', filters: ['date'], dateLabel: 'Processed or released between' },
  'Compliance Report': { icon: 'task', text: 'Each required document per scholar, with due dates and review status.', filters: ['course', 'scholarship'] },
  'Payment History Report': { icon: 'wallet', text: 'Every payment with scholar, amount, release date and method.', filters: ['date'], dateLabel: 'Processed or released between' },
  'Activity Log Report': { icon: 'note', text: 'Who did what in the system, and when (up to 5,000 entries).', filters: ['date'], dateLabel: 'Between' },
  'Scholarship Masterlist': { icon: 'scholar', text: 'The full list of scholars with course and status.', filters: [] },
};
const FALLBACK: ReportInfo = { icon: 'file', text: '', filters: ['date', 'course', 'scholarship', 'status'] };

/** Colour for the "Others" slice and legend dot. */
const OTHERS_COLOR = '#c5d0d3';

@Component({
  selector: 'app-reports',
  imports: [StatStrip, ScrollCue, AppIcon, FormsModule, Modal, PesoPipe, DatePipeShort],
  template: `
    <!-- Tabs + the action that belongs to the open tab -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="inline-flex gap-1 rounded-full bg-[#e3eaec] p-1" role="tablist" aria-label="Reports and analytics">
        @for (t of tabs; track t.id) {
          <button role="tab" [attr.aria-selected]="tab() === t.id" class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold transition sm:px-5"
                  [class]="tab() === t.id ? 'bg-white text-brand shadow-sm' : 'text-muted hover:text-ink'" (click)="switchTab(t.id)">
            <app-icon [name]="t.icon" class="h-[18px] w-[18px]"></app-icon>{{ t.label }}
          </button>
        }
      </div>
      @if (tab() === 'analytics') {
        <button class="btn btn-outline ml-auto" [disabled]="loadingCharts()" (click)="loadAnalytics()">
          <app-icon name="refresh" class="h-4 w-4" [class.animate-spin]="loadingCharts()"></app-icon>{{ loadingCharts() ? 'Refreshing…' : 'Refresh' }}
        </button>
      }
    </div>

    @if (tab() === 'reports') {
      <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div class="flex min-w-0 flex-col gap-5">

          <!-- 1 + 2: choose a report, then its filters -->
          <section class="card p-5 sm:p-6">
            <div class="mb-5 flex items-start gap-3">
              <app-icon name="file-search" class="card-icon h-10 w-10 shrink-0"></app-icon>
              <div>
                <h2 class="card-title">Build a report</h2>
                <p class="text-[13px] text-muted">Choose a report, set its filters, then generate it. You can print it or save it as PDF, Excel or Word.</p>
              </div>
            </div>

            <p class="section-title !mt-0">1 · Report</p>
            <div class="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3" role="radiogroup" aria-label="Report type">
              @for (t of reportTypes(); track t) {
                @let info = infoOf(t);
                <button type="button" role="radio" [attr.aria-checked]="q.type === t" (click)="pickType(t)"
                        class="group flex items-start gap-3 rounded-xl border p-3 text-left transition"
                        [class]="q.type === t ? 'border-brand bg-brand-soft ring-2 ring-brand/20' : 'border-line bg-white hover:border-[#b7c7cb] hover:bg-[#fafcfc]'">
                  <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition"
                        [class]="q.type === t ? 'bg-brand text-white' : 'bg-brand-soft text-brand'"><app-icon [name]="info.icon" class="h-5 w-5"></app-icon></span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-[14px] font-semibold text-ink">{{ t }}</span>
                    @if (info.text) { <span class="mt-0.5 block text-[12px] leading-snug text-muted">{{ info.text }}</span> }
                  </span>
                  @if (q.type === t) { <app-icon name="checked" class="h-5 w-5 shrink-0 text-brand"></app-icon> }
                </button>
              }
            </div>

            <p class="section-title !mt-6">2 · Filters</p>
            @let f = info();
            @if (!f.filters.length) {
              <p class="rounded-xl bg-[#f6f9f9] px-4 py-3 text-[13px] text-muted">This report always lists every scholar, so there is nothing to filter.</p>
            } @else {
              <div class="flex flex-col gap-4">
                @if (has('date')) {
                  <div>
                    <label class="field-label-b" for="r-from">{{ f.dateLabel ?? 'Date range' }}</label>
                    <div class="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick date ranges">
                      @for (p of presets; track p.label) {
                        <button type="button" class="rounded-full border px-3 py-1 text-[12px] font-semibold transition"
                                [class]="isPreset(p) ? 'border-brand bg-brand text-white' : 'border-[#cfd8db] bg-white text-ink hover:bg-brand-soft'"
                                [attr.aria-pressed]="isPreset(p)" (click)="applyPreset(p)">{{ p.label }}</button>
                      }
                    </div>
                    <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:max-w-[420px]">
                      <input id="r-from" class="input" type="date" [(ngModel)]="q.from" [max]="q.to" aria-label="From date" />
                      <span class="text-[13px] text-muted">to</span>
                      <input class="input" type="date" [(ngModel)]="q.to" [min]="q.from" aria-label="To date" />
                    </div>
                  </div>
                }
                @if (has('course') || has('scholarship') || has('status')) {
                  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    @if (has('course')) {
                      <div><label class="field-label-b" for="r-course">Course</label>
                        <select id="r-course" class="input" [(ngModel)]="q.course"><option>All Courses</option>@for (c of filters()?.courses ?? []; track c) { <option>{{ c }}</option> }</select></div>
                    }
                    @if (has('scholarship')) {
                      <div><label class="field-label-b" for="r-sch">Scholarship</label>
                        <select id="r-sch" class="input" [(ngModel)]="q.scholarship"><option>All Scholarships</option>@for (s of filters()?.scholarships ?? []; track s.id) { <option>{{ s.name }}</option> }</select></div>
                    }
                    @if (has('status')) {
                      <div><label class="field-label-b" for="r-st">Status</label>
                        <select id="r-st" class="input" [(ngModel)]="q.status"><option>All Status</option>@for (s of filters()?.statuses ?? []; track s) { <option>{{ s }}</option> }</select></div>
                    }
                  </div>
                }
              </div>
            }

            <div class="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
              <button class="btn btn-brand !h-[42px] !px-6" [disabled]="busy()" (click)="generate()">
                <app-icon [name]="busy() ? 'refresh' : 'table'" class="h-4 w-4" [class.animate-spin]="busy()"></app-icon>{{ busy() ? 'Generating…' : 'Generate report' }}
              </button>
              @if (f.filters.length) { <button class="btn btn-gray !h-[42px]" (click)="resetFilters()">Reset filters</button> }
            </div>
          </section>

          <!-- 3: the result -->
          <section class="card overflow-hidden" aria-live="polite">
            @if (report(); as r) {
              <div class="flex flex-wrap items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="card-title">{{ r.title }}</h2>
                    <span class="badge bg-brand-soft text-brand">{{ r.rows.length }} {{ r.rows.length === 1 ? 'record' : 'records' }}</span>
                  </div>
                  <p class="mt-0.5 text-[12px] text-muted">{{ summary() }}</p>
                </div>
                <div class="flex flex-wrap gap-2" role="group" aria-label="Export">
                  <button class="btn btn-outline" (click)="exportPdf()" title="Print, or choose “Save as PDF” in the print window"><app-icon name="printer" class="h-4 w-4"></app-icon>Print / PDF</button>
                  <button class="btn btn-outline" (click)="exportCsv()" title="Download for Excel (.csv)"><app-icon name="file-xls" class="h-4 w-4 text-ok"></app-icon>Excel</button>
                  <button class="btn btn-outline" (click)="exportDocx()" title="Editable copy for Microsoft Word (.docx)"><app-icon name="file-doc" class="h-4 w-4 text-info"></app-icon>Word</button>
                </div>
              </div>
              @if (r.rows.length) {
                <div scrollCue class="grid-wrap max-h-[560px]">
                  <table class="dgrid">
                    <thead><tr>@for (c of r.columns; track c) { <th>{{ c }}</th> }</tr></thead>
                    <tbody>@for (row of r.rows; track $index; let i = $index) { <tr [class.alt]="i % 2 === 1">@for (cell of row; track $index) { <td [class.wrap]="(cell?.length ?? 0) > 40">{{ cell ?? '—' }}</td> }</tr> }</tbody>
                  </table>
                </div>
              } @else {
                <div class="flex flex-col items-center gap-2 px-6 py-12 text-center">
                  <span class="flex h-12 w-12 items-center justify-center rounded-full bg-[#f1f5f6] text-muted"><app-icon name="file-search" class="h-6 w-6"></app-icon></span>
                  <p class="text-[14px] font-semibold text-ink">No records match these filters</p>
                  <p class="text-[13px] text-muted">Try a wider date range or set a filter back to “All”.</p>
                </div>
              }
            } @else {
              <div class="flex flex-col items-center gap-2 px-6 py-14 text-center">
                <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand"><app-icon name="table" class="h-7 w-7"></app-icon></span>
                <p class="text-[15px] font-semibold text-ink">Your report will appear here</p>
                <p class="max-w-[380px] text-[13px] text-muted">Pick a report above and press <b>Generate report</b>. Then print it or export it to Excel or Word.</p>
              </div>
            }
          </section>
        </div>

        <!-- Side panel: printable forms and receipts -->
        <aside class="flex min-w-0 flex-col gap-5">
          <section class="card p-5">
            <h2 class="card-title">Blank forms</h2>
            <p class="mb-3 mt-0.5 text-[12px] text-muted">Empty forms to print and fill in by hand, or download as Word to edit.</p>
            <ul class="-mx-2 divide-y divide-line">
              @for (t of templates; track t) {
                <li class="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[#f6f9f9]">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"><app-icon [name]="icons[t]" class="h-[18px] w-[18px]"></app-icon></span>
                  <span class="min-w-0 flex-1 text-[13px] font-medium text-ink">{{ t }}</span>
                  <button class="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-brand-soft hover:text-brand" (click)="printTemplate(t)"
                          [attr.aria-label]="'Print blank ' + t" title="Print"><app-icon name="printer" class="h-[18px] w-[18px]"></app-icon></button>
                  <button class="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-brand-soft hover:text-info" (click)="templateDocx(t)"
                          [attr.aria-label]="'Download blank ' + t + ' as Word'" title="Download as Word (.docx)"><app-icon name="file-doc" class="h-[18px] w-[18px]"></app-icon></button>
                </li>
              }
            </ul>
          </section>

          <section class="card p-5">
            <div class="flex items-start gap-3">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f5ec] text-ok"><app-icon name="receipt" class="h-5 w-5"></app-icon></span>
              <div class="min-w-0">
                <h2 class="card-title">Disbursement receipts</h2>
                <p class="mt-0.5 text-[12px] text-muted">An official receipt for a payment that has been released.</p>
              </div>
            </div>
            <button class="btn btn-ok mt-4 w-full !h-[40px]" (click)="openReceipts()">Choose a payment<app-icon name="arrow-right" class="h-4 w-4"></app-icon></button>
          </section>
        </aside>
      </div>
    } @else {
      <app-stat-strip [items]="statCards()" />

      @if (analytics(); as a) {
        <div class="grid items-start gap-5 lg:grid-cols-2">
          <!-- Scholars per scholarship: doughnut + its own legend (there can be many long names) -->
          <section class="card p-5 sm:p-6">
            <div class="mb-4 flex items-center gap-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand"><app-icon name="pie-chart" class="h-5 w-5"></app-icon></span>
              <div><h2 class="card-title">Scholars by scholarship</h2><p class="text-[12px] text-muted">Active scholars · {{ programsWithScholars() }} of {{ a.byScholarship.length }} programs have scholars</p></div>
            </div>
            @if (scholarshipTotal()) {
              <div class="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
                <div class="relative h-[190px] w-[190px] shrink-0">
                  <canvas #c1></canvas>
                  <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span class="text-[26px] font-bold leading-none text-ink">{{ scholarshipTotal() }}</span>
                    <span class="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">scholars</span>
                  </div>
                </div>
                <ul class="w-full min-w-0 flex-1 space-y-2">
                  @for (s of scholarshipLegend(); track s.label) {
                    <li class="min-w-0">
                      <div class="flex items-center gap-2 text-[13px]">
                        <span class="h-2.5 w-2.5 shrink-0 rounded-full" [style.background]="s.color"></span>
                        <span class="min-w-0 flex-1 truncate text-ink" [title]="s.label">{{ s.label }}</span>
                        <span class="shrink-0 font-semibold text-ink">{{ s.value }}</span>
                        <span class="w-[42px] shrink-0 text-right text-[12px] text-muted">{{ s.pct }}%</span>
                      </div>
                      <div class="ml-[18px] mt-1 h-1 overflow-hidden rounded-full bg-[#eef2f3]"><div class="h-full rounded-full" [style.width.%]="s.pct" [style.background]="s.color"></div></div>
                    </li>
                  }
                </ul>
              </div>
            } @else { <p class="py-10 text-center text-[13px] text-muted">No scholars yet.</p> }
          </section>

          <!-- Scholars per course -->
          <section class="card p-5 sm:p-6">
            <div class="mb-4 flex items-center gap-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand"><app-icon name="bar-chart" class="h-5 w-5"></app-icon></span>
              <div><h2 class="card-title">Scholars by course</h2><p class="text-[12px] text-muted">{{ a.byCourse.length }} courses</p></div>
            </div>
            @if (a.byCourse.length) {
              <div [style.height.px]="courseChartH()"><canvas #c2></canvas></div>
            } @else { <p class="py-10 text-center text-[13px] text-muted">No scholars yet.</p> }
          </section>

          <!-- Money released per month -->
          <section class="card p-5 sm:p-6 lg:col-span-2">
            <div class="mb-4 flex flex-wrap items-center gap-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand"><app-icon name="line-chart" class="h-5 w-5"></app-icon></span>
              <div class="min-w-0 flex-1"><h2 class="card-title">Monthly disbursements</h2><p class="text-[12px] text-muted">Money released to scholars, last 12 months</p></div>
              <div class="text-right"><p class="text-[11px] font-semibold uppercase tracking-wider text-muted">12-month total</p><p class="text-[20px] font-bold text-ok">{{ releasedTotal() | peso }}</p></div>
            </div>
            <div class="relative h-[280px]"><canvas #c3></canvas>
              @if (!releasedTotal()) {
                <div class="absolute inset-0 flex items-center justify-center px-6" role="status">
                  <div class="max-w-[380px] rounded-xl bg-white/95 px-5 py-3 text-center shadow-sm ring-1 ring-line">
                    <p class="text-[14px] font-semibold text-ink">No payments released in the last 12 months</p>
                    <p class="mt-1 text-[12px] text-muted">
                      @if (a.stats.queuedAmount > 0) { {{ a.stats.queuedAmount | peso }} is processed and waiting to be released. Release it in Payroll and it will show here. }
                      @else { Payments appear here once they are processed and released in Payroll. }
                    </p>
                  </div>
                </div>
              }
            </div>
          </section>
        </div>
      } @else {
        <!-- Loading placeholders in the shape of the charts -->
        <div class="grid gap-5 lg:grid-cols-2" aria-busy="true" aria-label="Loading charts">
          @for (i of [1, 2]; track i) { <div class="card h-[300px] animate-pulse p-6"><div class="h-4 w-40 rounded bg-[#eef2f3]"></div><div class="mt-6 h-[200px] rounded-xl bg-[#f3f6f7]"></div></div> }
          <div class="card h-[340px] animate-pulse p-6 lg:col-span-2"><div class="h-4 w-48 rounded bg-[#eef2f3]"></div><div class="mt-6 h-[240px] rounded-xl bg-[#f3f6f7]"></div></div>
        </div>
      }
    }

    @if (receiptsOpen()) {
      <app-modal title="Print a disbursement receipt" [width]="760" (closed)="receiptsOpen.set(false)">
        <p class="mb-3 text-[13px] text-muted">Pick a released payment. Print it, or download it as an editable Word file.</p>
        <div scrollCue class="grid-wrap max-h-[420px] rounded-xl border border-line">
          <table class="dgrid"><thead><tr><th>Scholar</th><th>Period</th><th>Amount</th><th>Released</th><th></th></tr></thead>
            <tbody>@for (p of released(); track p.id; let i = $index) {
              <tr [class.alt]="i % 2 === 1">
                <td><span class="font-semibold">{{ p.scholarName }}</span><span class="block text-[12px] text-muted">{{ p.scholarNumber }} · #{{ p.id }}</span></td>
                <td>{{ p.period }}</td><td class="font-semibold">{{ p.amount | peso }}</td><td>{{ p.releaseDate | dmy }}</td>
                <td class="whitespace-nowrap text-right">
                  <button class="btn btn-ok !h-[32px] !px-3 !text-[12px]" (click)="printReceipt(p.id)" [attr.aria-label]="'Print receipt for ' + p.scholarName + ', ' + p.period"><app-icon name="printer" class="h-4 w-4"></app-icon>Print</button>
                  <button class="btn btn-outline ml-1 !h-[32px] !px-3 !text-[12px]" (click)="receiptDocx(p.id)" [attr.aria-label]="'Download receipt for ' + p.scholarName + ' as Word'"><app-icon name="file-doc" class="h-4 w-4 text-info"></app-icon>Word</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="!h-auto !py-10 text-center">
                <p class="text-[14px] font-semibold text-ink">No released payments yet</p>
                <p class="mt-1 text-[13px] text-muted">Receipts are available once a payment is released in Payroll.</p>
              </td></tr>
            }</tbody></table>
        </div>
      </app-modal>
    }
  `,
})
export class ReportsPage implements OnInit, OnDestroy {
  private api = inject(Api);
  private dlg = inject(DialogService);
  private toast = inject(ToastService);
  private c1 = viewChild<ElementRef<HTMLCanvasElement>>('c1');
  private c2 = viewChild<ElementRef<HTMLCanvasElement>>('c2');
  private c3 = viewChild<ElementRef<HTMLCanvasElement>>('c3');
  private charts: Chart[] = [];

  tabs = [{ id: 'reports', label: 'Reports', icon: 'file' }, { id: 'analytics', label: 'Analytics', icon: 'analysis' }] as const;
  tab = signal<'reports' | 'analytics'>('reports');
  filters = signal<ScholarFilters | null>(null);
  reportTypes = signal<string[]>([]);
  report = signal<ReportResult | null>(null);
  analytics = signal<Analytics | null>(null);
  released = signal<ReleasedPayment[]>([]);
  receiptsOpen = signal(false);
  busy = signal(false);
  loadingCharts = signal(false);
  templates = TEMPLATE_LIST; icons = TEMPLATE_ICONS;

  // The report form (type, date range, filters). Default range: last 12 months.
  q: ReportForm = { type: 'Scholar Census Report', from: daysAgo(365), to: today(), course: 'All Courses', scholarship: 'All Scholarships', status: 'All Status' };
  /** The form exactly as it was when the shown report was generated (exports use this, not later edits). */
  private shownQ = signal<ReportForm | null>(null);
  /** Bumped when the report type changes, so the filter section re-reads info(). */
  private typeVersion = signal(0);

  readonly presets = [
    { label: 'Last 30 days', from: () => daysAgo(30) },
    { label: 'Last 3 months', from: () => daysAgo(91) },
    { label: 'This year', from: () => `${new Date().getFullYear()}-01-01` },
    { label: 'Last 12 months', from: () => daysAgo(365) },
  ];

  infoOf = (t: string): ReportInfo => REPORTS[t] ?? FALLBACK;
  info = computed(() => { this.typeVersion(); return this.infoOf(this.q.type); });
  has = (f: Filter) => this.info().filters.includes(f);
  isPreset = (p: { from: () => string }) => this.q.from === p.from() && this.q.to === today();

  /** One line under the report title: when it was made and with which filters. */
  summary = computed(() => {
    const q = this.shownQ(); if (!q) return '';
    const i = this.infoOf(q.type); const parts: string[] = [];
    if (!i.filters.length) return 'All scholars';
    if (i.filters.includes('date')) parts.push(`${fmtDate(q.from)} – ${fmtDate(q.to)}`);
    if (i.filters.includes('course') && !q.course.startsWith('All')) parts.push(q.course);
    if (i.filters.includes('scholarship') && !q.scholarship.startsWith('All')) parts.push(q.scholarship);
    if (i.filters.includes('status') && !q.status.startsWith('All')) parts.push(q.status);
    if (parts.length === (i.filters.includes('date') ? 1 : 0) && i.filters.some((f) => f !== 'date')) parts.push('all scholars');
    return parts.join(' · ');
  });

  // Number cards on the analytics tab.
  statCards = computed<StatItem[]>(() => {
    const s = this.analytics()?.stats;
    return [
      { label: 'Active scholars', value: s?.totalScholars ?? 0 },
      { label: 'Scholarship programs', value: s?.activeScholarships ?? 0, sub: 'Active types offered' },
      { label: 'Total disbursed', value: formatPeso(s?.totalDisbursed), sub: 'Released payments only', tone: 'ok' },
      { label: 'Awaiting release', value: s?.queuedAmount ? formatPeso(s.queuedAmount) : 0, tone: 'pending', sub: `${s?.pendingPayments ?? 0} processed ${s?.pendingPayments === 1 ? 'payment' : 'payments'}` },
    ];
  });

  programsWithScholars = computed(() => (this.analytics()?.byScholarship ?? []).filter((x) => x.value > 0).length);
  scholarshipTotal = computed(() => (this.analytics()?.byScholarship ?? []).reduce((n, x) => n + x.value, 0));
  /** Biggest 6 programs, the rest grouped as "Others", with colours and percentages for the legend and the doughnut. */
  scholarshipLegend = computed(() => {
    const all = [...(this.analytics()?.byScholarship ?? [])].filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
    const total = this.scholarshipTotal() || 1;
    const top = all.length > 7 ? all.slice(0, 6) : all;
    const rest = all.slice(top.length).reduce((n, x) => n + x.value, 0);
    const rows = top.map((x, i) => ({ label: x.label, value: x.value, color: CHART_COLORS[i % CHART_COLORS.length] }));
    if (rest) rows.push({ label: `Others (${all.length - top.length} programs)`, value: rest, color: OTHERS_COLOR });
    return rows.map((r) => ({ ...r, pct: Math.round((r.value / total) * 1000) / 10 }));
  });
  /** Bar chart height grows with the number of courses so every label stays readable. */
  courseChartH = computed(() => Math.max(220, (this.analytics()?.byCourse.length ?? 0) * 30 + 40));
  releasedTotal = computed(() => (this.analytics()?.monthlyDisbursement ?? []).reduce((n, x) => n + x.value, 0));

  // On open: load the filter choices and the list of report types.
  async ngOnInit(): Promise<void> {
    try {
      const [f, t] = await Promise.all([firstValueFrom(this.api.get<ScholarFilters>('/admin/scholars/filters')), firstValueFrom(this.api.get<string[]>('/admin/reports/types'))]);
      this.filters.set(f); this.reportTypes.set(t);
    } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
  ngOnDestroy(): void { this.charts.forEach((c) => c.destroy()); }

  pickType(t: string): void { this.q.type = t; this.typeVersion.update((v) => v + 1); }
  applyPreset(p: { from: () => string }): void { this.q.from = p.from(); this.q.to = today(); }
  resetFilters(): void { Object.assign(this.q, { from: daysAgo(365), to: today(), course: 'All Courses', scholarship: 'All Scholarships', status: 'All Status' }); }

  // The report form as URL parameters (the shown report's form when exporting).
  private params(q: ReportForm = this.q) { return { type: q.type, from: q.from, to: q.to, course: q.course, scholarship: q.scholarship, status: q.status }; }

  // Build the report on the server and show it as a table.
  async generate(): Promise<void> {
    if (this.has('date') && this.q.from > this.q.to) { void this.dlg.warning('The start date must be on or before the end date.', 'Date range'); return; }
    this.busy.set(true);
    try {
      const snapshot = { ...this.q };
      const r = await firstValueFrom(this.api.get<ReportResult>('/admin/reports/generate', this.params(snapshot)));
      this.report.set(r); this.shownQ.set(snapshot);
      this.toast.show(`${r.title}: ${r.rows.length} ${r.rows.length === 1 ? 'record' : 'records'}`);
    } catch (e) { void this.dlg.error(errorMessage(e), 'Could not generate the report'); } finally { this.busy.set(false); }
  }

  async exportCsv(): Promise<void> {
    try { await this.api.download('/admin/reports/csv', this.params(this.shownQ() ?? this.q), 'Report.csv'); } catch (e) { void this.dlg.error(errorMessage(e), 'Export Excel'); }
  }

  // Editable Word copy of the shown report (GET /api/admin/reports/docx).
  async exportDocx(): Promise<void> {
    if (!this.report()) { void this.dlg.warning('Generate a report first, then export it.', 'Export Word'); return; }
    try { await this.api.download('/admin/reports/docx', this.params(this.shownQ() ?? this.q), 'Report.docx'); }
    catch (e) { void this.dlg.error(errorMessage(e), 'Export Word'); }
  }

  // Print the shown report. The user can choose "Save as PDF" in the print dialog.
  exportPdf(): void {
    const r = this.report();
    if (!r || !r.rows.length) { void this.dlg.warning('There is nothing to print: the report has no records.', 'Print'); return; }
    printHtml(r.title, reportHtml(r.title, r.columns, r.rows));
  }

  // Blank form as an editable Word file (the layout comes from shared/print.ts).
  async templateDocx(name: string): Promise<void> {
    try { await this.api.downloadPost('/admin/reports/template-docx', templateDef(name), name + '.docx'); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
  printTemplate(name: string): void { printHtml(name, templateHtml(name)); }

  // Open the list of released payments to choose a receipt from.
  async openReceipts(): Promise<void> {
    try { this.released.set(await firstValueFrom(this.api.get<ReleasedPayment[]>('/admin/reports/released-payments'))); this.receiptsOpen.set(true); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
  // Load one receipt and print it.
  async printReceipt(id: number): Promise<void> {
    try { const r = await firstValueFrom(this.api.get<Receipt>(`/admin/reports/receipts/${id}`)); printHtml('Receipt ' + r.referenceNumber, receiptHtml(r)); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
  // One receipt as an editable Word file.
  async receiptDocx(id: number): Promise<void> {
    try { await this.api.download(`/admin/reports/receipts/${id}/docx`, {}, `Receipt_${id}.docx`); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  // Switching to analytics loads the charts (after the tab is drawn).
  switchTab(t: 'reports' | 'analytics'): void {
    this.tab.set(t);
    this.charts.forEach((c) => c.destroy()); this.charts = [];
    if (t === 'analytics') setTimeout(() => void this.loadAnalytics());
  }

  // Load the numbers, then draw the doughnut (by scholarship), bar (by course) and line (money per month).
  async loadAnalytics(): Promise<void> {
    this.loadingCharts.set(true);
    try {
      const a = await firstValueFrom(this.api.get<Analytics>('/admin/reports/analytics'));
      this.analytics.set(a);
      // Wait one tick so the <canvas> elements exist, then replace the old charts.
      setTimeout(async () => {
        this.charts.forEach((c) => c.destroy()); this.charts = [];
        const [e1, e2, e3] = [this.c1()?.nativeElement, this.c2()?.nativeElement, this.c3()?.nativeElement];
        const legend = this.scholarshipLegend();
        if (e1) this.charts.push(await makeChart(e1, doughnutConfig(legend.map((x) => x.label), legend.map((x) => x.value), legend.map((x) => x.color))));
        const courses = [...a.byCourse].sort((x, y) => y.value - x.value);
        if (e2) this.charts.push(await makeChart(e2, barConfig(courses.map((x) => x.label), courses.map((x) => x.value))));
        if (e3) this.charts.push(await makeChart(e3, lineConfig(a.monthlyDisbursement.map((x) => x.label), a.monthlyDisbursement.map((x) => x.value))));
      });
    } catch (e) { void this.dlg.error(errorMessage(e)); } finally { this.loadingCharts.set(false); }
  }
}

/** "2026-01-31" -> "Jan 31, 2026" for the report summary line. */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
