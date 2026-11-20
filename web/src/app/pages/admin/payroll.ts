import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, PesoPipe, statusColor } from '../../core/format';
import { DisbursementHistory, Option, PayrollCandidate, PayrollPreview, PayrollResult, PayrollStats, ProcessedPayment, ReleaseResult, ScholarFilters } from '../../core/models';
import { YEAR_LEVELS } from '../register';

@Component({
  selector: 'app-payroll',
  imports: [FormsModule, PesoPipe, DatePipeShort],
  template: `
    <div class="mb-4 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5">
      @for (c of cards(); track c.label) {
        <div class="card flex h-[120px] items-center gap-4 px-5">
          <img [src]="'assets/' + c.icon" alt="" class="h-[52px] w-[48px] object-contain" />
          <div><p class="text-[12pt] font-bold">{{ c.label }}</p><p class="font-bold text-accent" [class.text-[30px]]="!c.small" [class.text-[24px]]="c.small">{{ c.value }}</p></div>
        </div>
      }
    </div>

    <div class="card mb-3 flex flex-wrap items-end gap-4 p-4">
      <div class="min-w-[220px] flex-1"><label class="field-label-b">Search by Name/ID</label><input class="input" [ngModel]="search()" (ngModelChange)="search.set($event); reloadSoon()" /></div>
      <div><label class="field-label-b">Scholarship Type</label>
        <select class="input !w-[190px]" [ngModel]="typeId()" (ngModelChange)="typeId.set($event); load()"><option [ngValue]="0">All Scholarships</option>@for (o of typeOptions(); track o.id) { <option [ngValue]="o.id">{{ o.name }}</option> }</select></div>
      <div><label class="field-label-b">Year Level</label>
        <select class="input !w-[140px]" [ngModel]="year()" (ngModelChange)="year.set($event); load()"><option>All Year Levels</option>@for (y of years; track y) { <option>{{ y }}</option> }</select></div>
      <div class="ml-auto flex gap-2"><button class="btn btn-accent" (click)="selectAll()">Select All Eligible</button><button class="btn" style="background:gray" (click)="selected.set(new_set())">Clear Selection</button></div>
    </div>

    <div class="card mb-4 flex flex-wrap items-end gap-4 p-4">
      <div><label class="field-label-b">Payment Period</label><input class="input !w-[210px]" type="month" [ngModel]="periodMonth()" (ngModelChange)="periodMonth.set($event); load(); loadHistory()" /></div>
      <div><label class="field-label-b">Payment Method</label>
        <select class="input !w-[180px]" [(ngModel)]="method">@for (m of methods; track m) { <option>{{ m }}</option> }</select></div>
      <div class="ml-auto flex flex-wrap gap-2">
        <button class="btn btn-accent !h-[40px]" [disabled]="busy()" (click)="release()">🔓 Release Payments{{ stats()?.readyForRelease ? ' (' + stats()!.readyForRelease + ' ready)' : '' }}</button>
        <button class="btn btn-ok !h-[40px] !text-[14px]" [disabled]="busy() || !selected().size" (click)="process()"><img src="assets/dollar.png" alt="" class="h-5 w-5" />Process Payroll</button>
        <button class="btn btn-accent !h-[40px] !text-[14px]" [disabled]="busy() || !selected().size" (click)="preview()"><img src="assets/analysis.png" alt="" class="h-5 w-5" />Preview</button>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[1fr_364px]">
      <section class="card overflow-hidden">
        <div class="grid-wrap max-h-[470px]">
          <table class="grid">
            <thead><tr><th class="w-[40px]"></th><th>Scholar #</th><th>Name</th><th>Course</th><th>Year</th><th>Scholarship</th><th>Stipend</th><th>Compliance</th><th>Eligible</th></tr></thead>
            <tbody>
              @for (c of rows(); track c.id; let i = $index) {
                <tr [class.alt]="i % 2 === 1" [style.opacity]="c.isEligible ? 1 : .65">
                  <td><input type="checkbox" [disabled]="!c.isEligible" [checked]="selected().has(c.id)" (change)="toggle(c.id)" [attr.aria-label]="'Select ' + c.fullName" /></td>
                  <td>{{ c.scholarNumber }}</td><td class="font-bold">{{ c.fullName }}</td><td class="max-w-[220px] truncate" [title]="c.course ?? ''">{{ c.course }}</td><td>{{ c.yearLevel }}</td>
                  <td>{{ c.scholarshipType }}</td><td>{{ c.stipendAmount | peso }}</td>
                  <td><span class="font-bold" [style.color]="color(c.complianceStatus)">{{ c.complianceStatus }}</span></td>
                  <td>@if (c.paymentStatus === 'Already Paid') { <span class="font-bold text-[#d98f00]">⚠ Already Paid</span> } @else if (c.isEligible) { <span class="font-bold text-ok">✓ Yes</span> } @else { <span class="text-[#969696]">✗ No</span> }</td>
                </tr>
              } @empty { <tr><td colspan="9" class="!py-8 text-center text-[#969696]">No scholars found</td></tr> }
            </tbody>
          </table>
        </div>
      </section>

      <aside class="card p-5">
        <h2 class="mb-4 text-[14pt] font-bold text-accent">Batch Summary</h2>
        <p class="mb-3 text-[11pt]">Selected Scholars: {{ selected().size }}</p>
        <p class="mb-3 text-[14pt] font-bold text-accent">Total: {{ total() | peso }}</p>
        <p class="text-[11pt]">Method: {{ method }}</p>
        <p class="mt-3 text-[11pt]">Period: {{ periodLabel() }}</p>
      </aside>
    </div>

    <section class="card mt-4 overflow-hidden">
      <h2 class="px-4 pt-3 text-[14pt] font-bold text-accent">Disbursement History — {{ periodLabel() }}</h2>
      <div class="grid-wrap max-h-[300px] p-2">
        <table class="grid">
          <thead><tr><th>Scholar</th><th>Period</th><th>Amount</th><th>Status</th><th>Release Date</th><th>Method</th><th>Reference</th></tr></thead>
          <tbody>
            @for (h of history(); track h.id) {
              <tr [style.background]="h.status === 'Released' ? '#f0fff0' : ''">
                <td>{{ h.scholarName }}</td><td>{{ h.period }}</td><td>{{ h.amount | peso }}</td>
                <td><span class="font-bold" [style.color]="color(h.status)">{{ h.status }}</span></td><td>{{ h.releaseDate | dmy: 'Pending' }}</td><td>{{ h.paymentMethod }}</td><td>{{ h.referenceNumber }}</td>
              </tr>
            } @empty { <tr><td colspan="7" class="!py-6 text-center text-[#969696]">No payments for this period</td></tr> }
          </tbody>
        </table>
      </div>
    </section>
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

  new_set(): Set<number> { return new Set<number>(); }
  periodDate = computed(() => `${this.periodMonth() || new Date().toISOString().slice(0, 7)}-01`);
  periodLabel = computed(() => new Date(this.periodDate() + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
  total = computed(() => this.rows().filter((r) => this.selected().has(r.id)).reduce((s, r) => s + r.stipendAmount, 0));
  cards = computed(() => [
    { label: 'Eligible Scholars', value: String(this.rows().filter((r) => r.isEligible).length), icon: 'user-groups.png', small: false },
    { label: `Selected (${this.selected().size})`, value: String(this.selected().size), icon: 'checked.png', small: false },
    { label: 'Total Amount', value: '₱' + this.total().toLocaleString('en-US', { maximumFractionDigits: 0 }), icon: 'wallet.png', small: true },
    { label: 'Processed Today', value: String(this.stats()?.processedToday ?? 0), icon: 'dollar.png', small: false },
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

  async preview(): Promise<void> {
    try {
      const p = await firstValueFrom(this.api.post<PayrollPreview>('/admin/payroll/preview', this.body()));
      let m = `📋 PAYROLL PREVIEW\n\n📅 Period: ${p.period}\n💳 Method: ${p.method}\n👥 Selected Scholars: ${p.selected}\n`;
      if (p.alreadyPaid) m += `⚠ Already Paid (will be skipped): ${p.alreadyPaid}\n✅ New Scholars: ${p.new}\n`;
      m += `\n💰 Total Amount: ₱${p.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n\n` + p.lines.map((l) => `• ${l.fullName} - ₱${l.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`).join('\n');
      void this.dlg.info(m, 'Payroll Preview');
    } catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  async process(): Promise<void> {
    const pv = await firstValueFrom(this.api.post<PayrollPreview>('/admin/payroll/preview', this.body())).catch((e) => { void this.dlg.error(errorMessage(e)); return null; });
    if (!pv) return;
    if (pv.alreadyPaid && !(await this.dlg.confirm(`⚠ DOUBLE DISBURSEMENT WARNING!\n\n${pv.alreadyPaid} selected scholar(s) already have payments for ${pv.period} and will be skipped.\n\nContinue with the remaining scholars?`, '⚠ Duplicate Payment Warning'))) return;
    if (!pv.new) { void this.dlg.info('All selected scholars already have payments for this period.', 'No New Payments'); return; }
    if (!(await this.dlg.confirm(`CONFIRM PAYROLL\n\n📅 Period: ${pv.period}\n💳 Method: ${pv.method}\n👥 Scholars: ${pv.new}\n💰 Total: ₱${pv.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n\nProceed?`, 'Confirm Payroll Processing', 'Proceed', 'Cancel'))) return;
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.post<PayrollResult>('/admin/payroll/process', this.body()));
      this.selected.set(new Set());
      await Promise.all([this.load(), this.loadHistory(), this.loadStats()]);
      void this.dlg.success(`✅ PAYROLL PROCESSED SUCCESSFULLY!\n\n📅 Period: ${r.period}\n💳 Method: ${r.method}\n✅ Processed: ${r.processed} scholars${r.skipped ? `\n⏭ Skipped: ${r.skipped}` : ''}\n💰 Total: ₱${r.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n📧 Emails sent: ${r.emailsSent}  📱 SMS sent: ${r.smsSent}`, 'Payroll Processed');
    } catch (e) { void this.dlg.error(errorMessage(e), 'Processing Error'); } finally { this.busy.set(false); }
  }

  async release(): Promise<void> {
    try {
      const ready = await firstValueFrom(this.api.get<ProcessedPayment[]>('/admin/payroll/ready-for-release'));
      if (!ready.length) {
        void this.dlg.info("📋 NO PAYMENTS READY FOR RELEASE\n\nPayments must meet ALL these conditions:\n✓ Status = 'Processed'\n✓ Release date is today or earlier\n\n📌 Newly processed payments have a 3-day waiting period before release.\n💡 Check the Disbursement History panel for payment status.", 'No Payments Ready');
        return;
      }
      const total = ready.reduce((s, p) => s + p.amount, 0);
      if (!(await this.dlg.confirm(`📋 RELEASE PAYMENTS\n\n👥 Scholars: ${ready.length}\n💰 Total Amount: ₱${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n\nThis will:\n• Mark payments as 'Released'\n• Set release date to today\n• Send release notifications to scholars\n\nContinue?`, 'Confirm Release', 'Release', 'Cancel'))) return;
      this.busy.set(true);
      const r = await firstValueFrom(this.api.post<ReleaseResult>('/admin/payroll/release', {}));
      await Promise.all([this.load(), this.loadHistory(), this.loadStats()]);
      void this.dlg.success(`✅ PAYMENTS RELEASED SUCCESSFULLY!\n\n🔓 Released: ${r.released} payments\n📧 Emails: ${r.emailsSent} sent\n\nScholars have been notified of their released stipends.`, 'Release Complete');
    } catch (e) { void this.dlg.error(errorMessage(e), 'Release Error'); } finally { this.busy.set(false); }
  }
}
