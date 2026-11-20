import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, PesoPipe, statusColor, formatPeso } from '../../core/format';
import { DisbursementHistory, Option, PayrollCandidate, PayrollPreview, PayrollResult, PayrollStats, ProcessedPayment, ReleaseResult, ScholarFilters } from '../../core/models';
import { YEAR_LEVELS } from '../register';
import { AppIcon } from '../../shared/icon';
import { Fact, FactGrid } from '../../shared/fact-grid';
import { Modal } from '../../shared/modal';
import { ScrollCue } from '../../shared/scroll-cue';
import { StatItem, StatStrip } from '../../shared/stat-strip';

@Component({
  selector: 'app-payroll',
  imports: [Modal, FactGrid, StatStrip, ScrollCue, AppIcon, FormsModule, PesoPipe, DatePipeShort],
  template: `
    <app-stat-strip [items]="cards()" />

    <div class="card mb-3 flex flex-wrap items-end gap-4 p-4">
      <div class="min-w-[220px] flex-1"><label class="field-label-b">Search by Name/ID</label><input class="input" [ngModel]="search()" (ngModelChange)="search.set($event); reloadSoon()" /></div>
      <div><label class="field-label-b">Scholarship Type</label>
        <select class="input !w-[190px]" [ngModel]="typeId()" (ngModelChange)="typeId.set($event); load()"><option [ngValue]="0">All Scholarships</option>@for (o of typeOptions(); track o.id) { <option [ngValue]="o.id">{{ o.name }}</option> }</select></div>
      <div><label class="field-label-b">Year Level</label>
        <select class="input !w-[140px]" [ngModel]="year()" (ngModelChange)="year.set($event); load()"><option>All Year Levels</option>@for (y of years; track y) { <option>{{ y }}</option> }</select></div>
      <div class="ml-auto flex gap-2"><button class="btn btn-accent" (click)="selectAll()">Select All Eligible</button><button class="btn btn-gray" (click)="selected.set(new_set())">Clear Selection</button></div>
    </div>

    <div class="card mb-4 flex flex-wrap items-end gap-4 p-4">
      <div><label class="field-label-b">Payment Period</label><input class="input !w-[210px]" type="month" [ngModel]="periodMonth()" (ngModelChange)="periodMonth.set($event); load(); loadHistory()" /></div>
      <div><label class="field-label-b">Payment Method</label>
        <select class="input !w-[180px]" [(ngModel)]="method">@for (m of methods; track m) { <option>{{ m }}</option> }</select></div>
      <p class="pb-1 text-[14px]" aria-live="polite"><b>{{ selected().size }}</b> selected · Total <b class="text-accent">{{ total() | peso }}</b> for {{ periodLabel() }}</p>
      <div class="ml-auto flex flex-col items-end gap-2">
        <div class="flex flex-wrap items-center justify-end gap-2" role="group" aria-label="Payroll steps">
          <span class="text-[12px] font-bold text-label">Step 1</span>
          <button class="btn btn-gray !h-[40px] !text-[14px]" [disabled]="busy() || !selected().size" [attr.title]="selected().size ? null : needSelection" (click)="preview()"><app-icon name="analysis" class="h-5 w-5"></app-icon>Preview</button>
          <span class="text-[12px] font-bold text-label">Step 2</span>
          <button class="btn btn-brand !h-[40px] !text-[14px]" [disabled]="busy() || !selected().size" [attr.title]="selected().size ? null : needSelection" (click)="process()"><app-icon name="dollar" class="h-5 w-5"></app-icon>Process Payroll</button>
          <span class="mx-1 hidden h-[28px] w-px bg-[#c9c9c9] sm:block" aria-hidden="true"></span>
          <span class="text-[12px] font-bold text-label">Step 3</span>
          <button class="btn btn-outline !h-[40px] !text-[14px]" [disabled]="busy() || !(stats()?.readyForRelease)" [attr.title]="stats()?.readyForRelease ? null : noRelease" (click)="release()"><app-icon name="wallet" class="h-5 w-5"></app-icon>Release Payments{{ stats()?.readyForRelease ? ' (' + stats()!.readyForRelease + ' ready)' : '' }}</button>
        </div>
        @if (!selected().size) { <p class="text-[12px] text-muted">Preview and Process are off until you tick at least one eligible scholar.</p> }
        @if (!stats()?.readyForRelease) { <p class="text-[12px] text-muted">{{ noRelease }}</p> }
      </div>
    </div>

    <section class="card overflow-hidden">
      <div scrollCue class="grid-wrap max-h-[470px]">
        <table class="dgrid">
          <thead><tr><th class="w-[40px]"></th><th>Scholar #</th><th>Name</th><th>Course</th><th>Year</th><th>Scholarship</th><th>Stipend</th><th>Compliance</th><th>Eligible</th></tr></thead>
          <tbody>
            @for (c of rows(); track c.id; let i = $index) {
              <tr [class.alt]="i % 2 === 1" [style.opacity]="c.isEligible ? 1 : .65">
                <td><input type="checkbox" [disabled]="!c.isEligible" [checked]="selected().has(c.id)" (change)="toggle(c.id)" [attr.aria-label]="'Select ' + c.fullName" /></td>
                <td>{{ c.scholarNumber }}</td><td class="font-bold">{{ c.fullName }}</td><td class="wrap">{{ c.course }}</td><td>{{ c.yearLevel }}</td>
                <td class="wrap">{{ c.scholarshipType }}</td><td>{{ c.stipendAmount | peso }}</td>
                <td><span class="font-bold" [style.color]="color(c.complianceStatus)">{{ c.complianceStatus }}</span></td>
                <td>@if (c.paymentStatus === 'Already Paid') { <span class="font-bold text-[#8a5300]"><app-icon name="alert" class="mr-1 inline-flex h-4 w-4 align-[-3px]"></app-icon>Already Paid</span> } @else if (c.isEligible) { <span class="font-bold text-ok"><app-icon name="checked" class="mr-1 inline-flex h-4 w-4 align-[-3px]"></app-icon>Yes</span> } @else { <span class="font-bold text-[#4b5563]">No</span><span class="block whitespace-normal text-[12px] leading-tight text-[#4b5563]">{{ reason(c) }}</span> }</td>
              </tr>
            } @empty { <tr><td colspan="9" class="!py-8 text-center text-[#595959]">No scholars found</td></tr> }
          </tbody>
        </table>
      </div>
    </section>


    <section class="card overflow-hidden">
      <h2 class="px-4 pt-3 text-[14pt] font-bold text-accent">Disbursement History — {{ periodLabel() }}</h2>
      <div scrollCue class="grid-wrap max-h-[300px] p-2">
        <table class="dgrid">
          <thead><tr><th>Scholar</th><th>Period</th><th>Amount</th><th>Status</th><th>Release Date</th><th>Method</th><th>Reference</th></tr></thead>
          <tbody>
            @for (h of history(); track h.id) {
              <tr [style.background]="h.status === 'Released' ? '#f0fff0' : ''">
                <td>{{ h.scholarName }}</td><td>{{ h.period }}</td><td>{{ h.amount | peso }}</td>
                <td><span class="font-bold" [style.color]="color(h.status)">{{ h.status }}</span></td><td>{{ h.releaseDate | dmy: 'Pending' }}</td><td>{{ h.paymentMethod }}</td><td>{{ h.referenceNumber }}</td>
              </tr>
            } @empty { <tr><td colspan="7" class="!py-6 text-center text-[#595959]">No payments for this period</td></tr> }
          </tbody>
        </table>
      </div>
    </section>

    @if (previewDlg(); as v) {
      <app-modal [title]="v.confirm ? 'Confirm payroll' : 'Payroll preview'" [width]="720" (closed)="previewDlg.set(null)">
        <app-fact-grid [facts]="previewFacts(v.p)" />
        @if (v.p.alreadyPaid) {
          <div class="mt-4 flex items-start gap-3 rounded-lg border-l-4 border-warn bg-[#fff8e6] px-4 py-3" role="alert">
            <app-icon name="alert" class="mt-[2px] h-5 w-5 shrink-0 text-[#8a5300]"></app-icon>
            <p class="text-[13px] text-[#333]"><b>{{ v.p.alreadyPaid }}</b> of the selected scholars already have a payment for {{ v.p.period }}. They will be skipped so nobody is paid twice.</p>
          </div>
        }
        <h3 class="section-title mt-4">Scholars in this batch</h3>
        <div scrollCue class="grid-wrap max-h-[280px] rounded border border-[#e6e6e6]">
          <table class="dgrid"><thead><tr><th>Scholar</th><th class="text-right">Amount</th><th>Result</th></tr></thead>
            <tbody>@for (l of v.p.lines; track l.scholarId; let i = $index) {
              <tr [class.alt]="i % 2 === 1"><td class="font-bold">{{ l.fullName }}</td><td class="text-right">{{ l.amount | peso }}</td>
                <td>@if (l.alreadyPaid) { <span class="font-bold text-[#8a5300]"><app-icon name="alert" class="mr-1 inline-flex h-4 w-4 align-[-3px]"></app-icon>Skipped, already paid</span> }
                    @else { <span class="font-bold text-ok"><app-icon name="checked" class="mr-1 inline-flex h-4 w-4 align-[-3px]"></app-icon>Will be paid</span> }</td></tr>
            }</tbody></table>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          @if (v.confirm) {
            <button class="btn btn-gray !h-[40px]" (click)="previewDlg.set(null)">Cancel</button>
            <button class="btn btn-brand !h-[40px]" [disabled]="busy()" (click)="runProcess()"><app-icon name="dollar" class="h-5 w-5"></app-icon>Process {{ v.p.new }} payment{{ v.p.new === 1 ? '' : 's' }}</button>
          } @else { <button class="btn btn-brand !h-[40px]" (click)="previewDlg.set(null)">Close</button> }
        </div>
      </app-modal>
    }

    @if (processed(); as r) {
      <app-modal title="Payroll processed" [width]="520" (closed)="processed.set(null)">
        <div class="mb-4 flex items-center gap-3"><app-icon name="checked" class="h-[40px] w-[40px] text-ok"></app-icon>
          <p class="text-[14px] text-[#333]">{{ r.processed }} payment{{ r.processed === 1 ? ' is' : 's are' }} queued for release. Scholars were notified.</p></div>
        <app-fact-grid [facts]="resultFacts(r)" />
        <div class="mt-5 flex justify-end"><button class="btn btn-brand !h-[40px]" (click)="processed.set(null)">Done</button></div>
      </app-modal>
    }

    @if (releaseDlg(); as v) {
      <app-modal title="Release payments" [width]="720" (closed)="releaseDlg.set(null)">
        <app-fact-grid [facts]="releaseFacts(v.ready, v.total)" />
        <div class="mt-4 flex items-start gap-3 rounded-lg bg-[#eef8f8] px-4 py-3">
          <app-icon name="info" class="mt-[2px] h-5 w-5 shrink-0 text-accent"></app-icon>
          <p class="text-[13px] text-[#333]">Releasing marks these payments as Released, sets today as the release date and notifies each scholar. This can't be undone.</p>
        </div>
        <div scrollCue class="grid-wrap mt-4 max-h-[260px] rounded border border-[#e6e6e6]">
          <table class="dgrid"><thead><tr><th>Scholar</th><th>Period</th><th class="text-right">Amount</th><th>Method</th></tr></thead>
            <tbody>@for (x of v.ready; track x.paymentId; let i = $index) {
              <tr [class.alt]="i % 2 === 1"><td class="font-bold">{{ x.scholarName }}</td><td>{{ x.period }}</td><td class="text-right">{{ x.amount | peso }}</td><td>{{ x.paymentMethod }}</td></tr>
            }</tbody></table>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button class="btn btn-gray !h-[40px]" (click)="releaseDlg.set(null)">Cancel</button>
          <button class="btn btn-brand !h-[40px]" [disabled]="busy()" (click)="runRelease()"><app-icon name="wallet" class="h-5 w-5"></app-icon>Release {{ v.ready.length }} payment{{ v.ready.length === 1 ? '' : 's' }}</button>
        </div>
      </app-modal>
    }

    @if (released(); as r) {
      <app-modal title="Payments released" [width]="480" (closed)="released.set(null)">
        <div class="mb-4 flex items-center gap-3"><app-icon name="checked" class="h-[40px] w-[40px] text-ok"></app-icon>
          <p class="text-[14px] text-[#333]">Scholars have been notified of their released stipends.</p></div>
        <app-fact-grid [facts]="releasedFacts(r)" />
        <div class="mt-5 flex justify-end"><button class="btn btn-brand !h-[40px]" (click)="released.set(null)">Done</button></div>
      </app-modal>
    }

    @if (noneReady()) {
      <app-modal title="Nothing to release yet" [width]="520" (closed)="noneReady.set(false)">
        <p class="mb-3 text-[14px] text-[#333]">A payment can be released when:</p>
        <ul class="mb-4 space-y-2 text-[14px]">
          <li class="flex items-center gap-2"><app-icon name="checked" class="h-5 w-5 text-ok"></app-icon>its status is Processed, and</li>
          <li class="flex items-center gap-2"><app-icon name="checked" class="h-5 w-5 text-ok"></app-icon>its release date is today or earlier.</li>
        </ul>
        <div class="flex items-start gap-3 rounded-lg bg-[#eef8f8] px-4 py-3"><app-icon name="wall-clock" class="mt-[2px] h-5 w-5 shrink-0 text-accent"></app-icon>
          <p class="text-[13px] text-[#333]">New payments wait about 3 working days before they can be released. See the Disbursement History below for each payment's release date.</p></div>
        <div class="mt-5 flex justify-end"><button class="btn btn-brand !h-[40px]" (click)="noneReady.set(false)">OK</button></div>
      </app-modal>
    }
  `,
})
export class PayrollPage implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  years = YEAR_LEVELS; methods = ['Bank Transfer', 'Cash', 'Mobile Wallet']; color = statusColor;
  rows = signal<PayrollCandidate[]>([]);
  history = signal<DisbursementHistory[]>([]);
  stats = signal<PayrollStats | null>(null);
  typeOptions = signal<Option[]>([]);
  selected = signal<Set<number>>(new Set());
  search = signal(''); typeId = signal(0); year = signal('All Year Levels');
  periodMonth = signal(new Date().toISOString().slice(0, 7));
  method = 'Bank Transfer';
  busy = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly needSelection = 'Select at least one eligible scholar in the table first.';
  readonly noRelease = 'Release is off: no processed payment has reached its release date yet (new payments wait about 3 days).';
  new_set(): Set<number> { return new Set<number>(); }
  periodDate = computed(() => `${this.periodMonth() || new Date().toISOString().slice(0, 7)}-01`);
  periodLabel = computed(() => new Date(this.periodDate() + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
  total = computed(() => this.rows().filter((r) => this.selected().has(r.id)).reduce((s, r) => s + r.stipendAmount, 0));
  /** Why a scholar can't be selected, so "No" is never a dead end. */
  reason(c: PayrollCandidate): string {
    if (c.stipendAmount <= 0) return 'No stipend amount set';
    if (c.complianceStatus !== 'Complete') return `Compliance: ${c.complianceStatus}`;
    return 'Scholar not active';
  }
  cards = computed<{ label: string; value: string; icon: string; small: boolean; hint?: string }[]>(() => [
    { label: 'Eligible Scholars', value: String(this.rows().filter((r) => r.isEligible).length), icon: 'user-groups', small: false, hint: `of ${this.rows().length} listed · rest already paid or need compliance approved` },
    { label: 'Processed Today', value: String(this.stats()?.processedToday ?? 0), icon: 'dollar', small: false, hint: 'Payments processed today' },
  ]);

  async ngOnInit(): Promise<void> {
    const f = await firstValueFrom(this.api.get<ScholarFilters>('/admin/scholars/filters'));
    this.typeOptions.set(f.scholarships);
    await Promise.all([this.load(), this.loadHistory(), this.loadStats()]);
  }

  reloadSoon(): void { clearTimeout(this.timer); this.timer = setTimeout(() => void this.load(), 300); }

  async load(): Promise<void> {
    try {
      this.rows.set(await firstValueFrom(this.api.get<PayrollCandidate[]>('/admin/payroll/candidates', { period: this.periodDate(), scholarshipTypeId: this.typeId() || null, yearLevel: this.year(), search: this.search() })));
      this.selected.update((s) => new Set([...s].filter((id) => this.rows().some((r) => r.id === id && r.isEligible))));
    } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
  async loadHistory(): Promise<void> { this.history.set(await firstValueFrom(this.api.get<DisbursementHistory[]>('/admin/payroll/history', { period: this.periodDate() }))); }
  async loadStats(): Promise<void> { this.stats.set(await firstValueFrom(this.api.get<PayrollStats>('/admin/payroll/stats'))); }

  toggle(id: number): void { this.selected.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  selectAll(): void { this.selected.set(new Set(this.rows().filter((r) => r.isEligible).map((r) => r.id))); }

  private body() { return { periodDate: this.periodDate(), method: this.method, scholarIds: [...this.selected()] }; }

  previewDlg = signal<{ p: PayrollPreview; confirm: boolean } | null>(null);
  processed = signal<PayrollResult | null>(null);
  releaseDlg = signal<{ ready: ProcessedPayment[]; total: number } | null>(null);
  released = signal<ReleaseResult | null>(null);
  noneReady = signal(false);

  previewFacts(p: PayrollPreview): Fact[] {
    return [
      { icon: 'calendar', label: 'Period', value: p.period }, { icon: 'wallet', label: 'Method', value: p.method },
      { icon: 'user-groups', label: 'Selected', value: String(p.selected) }, { icon: 'checked', label: 'Will be paid', value: String(p.new), tone: 'ok' },
      ...(p.alreadyPaid ? [{ icon: 'alert', label: 'Skipped (already paid)', value: String(p.alreadyPaid), tone: 'pending' } as Fact] : []),
      { icon: 'dollar', label: 'Total amount', value: formatPeso(p.totalAmount), tone: 'strong' },
    ];
  }
  resultFacts(r: PayrollResult): Fact[] {
    return [
      { icon: 'calendar', label: 'Period', value: r.period }, { icon: 'wallet', label: 'Method', value: r.method },
      { icon: 'checked', label: 'Processed', value: String(r.processed), tone: 'ok' },
      ...(r.skipped ? [{ icon: 'alert', label: 'Skipped', value: String(r.skipped), tone: 'pending' } as Fact] : []),
      { icon: 'dollar', label: 'Total', value: formatPeso(r.total), tone: 'strong' },
      { icon: 'mail', label: 'Emails sent', value: String(r.emailsSent) }, { icon: 'phone', label: 'Texts sent', value: String(r.smsSent) },
    ];
  }
  releaseFacts(ready: ProcessedPayment[], total: number): Fact[] {
    return [{ icon: 'user-groups', label: 'Scholars', value: String(new Set(ready.map((x) => x.scholarId)).size) }, { icon: 'file', label: 'Payments', value: String(ready.length) },
      { icon: 'dollar', label: 'Total amount', value: formatPeso(total), tone: 'strong' }];
  }
  releasedFacts(r: ReleaseResult): Fact[] {
    return [{ icon: 'checked', label: 'Released', value: String(r.released), tone: 'ok' }, { icon: 'dollar', label: 'Total', value: formatPeso(r.total), tone: 'strong' }, { icon: 'mail', label: 'Emails sent', value: String(r.emailsSent) }];
  }

  async preview(): Promise<void> {
    try { this.previewDlg.set({ p: await firstValueFrom(this.api.post<PayrollPreview>('/admin/payroll/preview', this.body())), confirm: false }); }
    catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  /** Step 2: show the batch for confirmation; nothing is paid until "Process" is pressed in the dialog. */
  async process(): Promise<void> {
    const pv = await firstValueFrom(this.api.post<PayrollPreview>('/admin/payroll/preview', this.body())).catch((e) => { void this.dlg.error(errorMessage(e)); return null; });
    if (!pv) return;
    if (!pv.new) { void this.dlg.info('All selected scholars already have payments for this period.', 'No new payments'); return; }
    this.previewDlg.set({ p: pv, confirm: true });
  }

  async runProcess(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.post<PayrollResult>('/admin/payroll/process', this.body()));
      this.previewDlg.set(null); this.selected.set(new Set());
      await Promise.all([this.load(), this.loadHistory(), this.loadStats()]);
      this.processed.set(r);
    } catch (e) { void this.dlg.error(errorMessage(e), 'Processing error'); } finally { this.busy.set(false); }
  }

  async release(): Promise<void> {
    try {
      const ready = await firstValueFrom(this.api.get<ProcessedPayment[]>('/admin/payroll/ready-for-release'));
      if (!ready.length) { this.noneReady.set(true); return; }
      this.releaseDlg.set({ ready, total: ready.reduce((t, x) => t + x.amount, 0) });
    } catch (e) { void this.dlg.error(errorMessage(e), 'Release error'); }
  }

  async runRelease(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.post<ReleaseResult>('/admin/payroll/release', {}));
      this.releaseDlg.set(null);
      await Promise.all([this.load(), this.loadHistory(), this.loadStats()]);
      this.released.set(r);
    } catch (e) { void this.dlg.error(errorMessage(e), 'Release error'); } finally { this.busy.set(false); }
  }
}
