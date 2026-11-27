// =====================================================================
// payments.ts - Payment History (/scholar/payments).
// Table of the scholar's own payments with filters and CSV export.
// API: GET /api/scholar/payments (and /payments/csv for the download).
// Live: reloads when the admin processes or releases a payment.
// =====================================================================
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RealtimeService, reloadOn } from '../../core/realtime';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, PesoPipe, statusColor, formatPeso, tint } from '../../core/format';
import { PaymentItem, ScholarDashboard, ScholarPayments } from '../../core/models';
import { AppIcon } from '../../shared/icon';
import { ScrollCue } from '../../shared/scroll-cue';
import { StatItem, StatStrip } from '../../shared/stat-strip';

@Component({
  selector: 'app-scholar-payments',
  imports: [StatStrip, RouterLink, ScrollCue, AppIcon, FormsModule, PesoPipe, DatePipeShort],
  template: `
    @if (data(); as d) {
      @if (d.totalPayments === 0) {
        <section class="card mx-auto mt-6 max-w-[680px] p-10 text-center">
          <app-icon name="wallet" class="card-icon mx-auto mb-4 h-[64px] w-[64px]"></app-icon>
          <h2 class="mb-2 text-[18px] font-bold text-brand">Your payments will appear here</h2>
          <p class="text-[14px] text-[#4b5563]">
            @if (info(); as i) { Your first stipend is expected around <b>{{ i.nextPaymentDate }}</b>{{ i.nextPaymentNote.startsWith('Estimated') ? ' (an estimate)' : '' }}. }
            Each payment shows up after the Scholarship Office processes it, with its status and reference number.
          </p>
          @if ((info()?.documentsDue ?? 0) > 0) {
            <p class="mt-4 text-[14px] text-[#4b5563]">Payments are only released once your documents are complete — <b>{{ info()!.documentsDue }} still to submit</b>.</p>
            <a routerLink="/scholar/compliance" class="btn btn-ok mt-4 !h-[42px] !px-6">Upload my documents</a>
          }
        </section>
      } @else {
    <app-stat-strip [items]="stats()" />

      <!-- Filters on the left, downloads on the right -->
      <div class="card my-4 flex flex-wrap items-end gap-3 p-4">
        <div><label for="pf-status" class="mb-1 block text-[12px] font-bold text-[#4b5563]">Status</label>
          <select id="pf-status" class="input !w-[150px]" [(ngModel)]="status"><option>All</option><option>Pending</option><option>Processed</option><option>Released</option><option>Failed</option></select></div>
        <div><label for="pf-period" class="mb-1 block text-[12px] font-bold text-[#4b5563]">Period</label>
          <select id="pf-period" class="input !w-[180px]" [(ngModel)]="period"><option>All Periods</option>@for (p of periods(); track p) { <option>{{ p }}</option> }</select></div>
        @if (status !== 'All' || period !== 'All Periods') { <button class="btn btn-gray !h-[36px]" (click)="status = 'All'; period = 'All Periods'">Clear filters</button> }
        <div class="flex flex-wrap items-center gap-2 sm:ml-auto">
          <span class="text-[12px] font-bold text-[#4b5563]">Download:</span>
          <button class="btn btn-outline !h-[36px]" (click)="exportCsv()"><app-icon name="file" class="h-4 w-4"></app-icon>CSV</button>
          <button class="btn btn-outline !h-[36px]" (click)="exportDocx()" title="Editable copy you can open in Microsoft Word"><app-icon name="file" class="h-4 w-4"></app-icon>Word (.docx)</button>
        </div>
      </div>

      <div class="grid items-start gap-5" [class]="sel() ? 'xl:grid-cols-[1fr_340px]' : ''">
        <section class="card overflow-hidden">
          <!-- Phones: one card per payment (tap for details) -->
          <ul class="divide-y divide-[#eeeeee] md:hidden">
            @for (p of filtered(); track p.id) {
              <li><button class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#f0f7f8]" [class.bg-[#e6f5f5]]="sel()?.id === p.id" (click)="sel.set(p)">
                <div class="min-w-0 flex-1"><p class="font-bold text-ink">{{ p.period }}</p>
                  <p class="text-[12px] text-[#4b5563]">{{ p.status === 'Released' ? 'Released' : 'Expected' }} {{ p.releaseDate | dmy: 'date pending' }}{{ p.paymentMethod ? ' · ' + p.paymentMethod : '' }}</p></div>
                <div class="shrink-0 text-right"><p class="font-bold text-ink">{{ p.amount | peso }}</p>
                  <span class="rounded-full px-2 py-[1px] text-[11px] font-bold" [style.background]="tint(color(p.status))" [style.color]="color(p.status)">{{ p.status }}</span></div>
              </button></li>
            } @empty { <li class="px-4 py-8 text-center text-[13px] text-[#4b5563]">No payments match these filters.</li> }
          </ul>
          <!-- Tablets and up: the full table -->
          <div scrollCue class="grid-wrap hidden max-h-[560px] md:block"><table class="dgrid">
            <thead><tr><th>Period</th><th class="!text-right">Amount</th><th>Status</th><th>Release</th><th>Method</th><th>Reference</th></tr></thead>
            <tbody>@for (p of filtered(); track p.id; let i = $index) {
              <tr class="cursor-pointer" [class.alt]="i % 2 === 1" [class.sel]="sel()?.id === p.id" (click)="sel.set(p)" (keydown.enter)="sel.set(p)" tabindex="0" [attr.aria-label]="'Details of ' + p.period + ' payment'">
                <td class="font-bold">{{ p.period }}</td><td class="text-right">{{ p.amount | peso }}</td>
                <td><span class="rounded-full px-2 py-[2px] text-[12px] font-bold" [style.background]="tint(color(p.status))" [style.color]="color(p.status)">{{ p.status }}</span></td>
                <td>{{ p.status === 'Released' ? 'Released' : 'Expected' }} {{ p.releaseDate | dmy: 'date pending' }}</td><td>{{ p.paymentMethod || '—' }}</td><td class="font-mono text-[12px] text-[#4b5563]">{{ p.referenceNumber || '—' }}</td></tr>
            } @empty { <tr><td colspan="6" class="!py-8 text-center text-[#4b5563]">No payments match these filters.</td></tr> }</tbody></table></div>
          <p class="px-3 py-2 text-[12px] text-[#4b5563]">Showing {{ filtered().length }} {{ filtered().length === 1 ? 'payment' : 'payments' }} · click a row for details</p>
        </section>
        @if (sel()) {
        <!-- On phones the details slide up from the bottom (tap the dark area to close); on wide screens they sit beside the list. -->
        <div class="fixed inset-0 z-40 bg-black/40 xl:hidden" (click)="sel.set(null)" aria-hidden="true"></div>
        <aside class="card fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-b-none p-5 shadow-2xl xl:static xl:z-auto xl:max-h-none xl:rounded-b-xl xl:shadow-sm" role="dialog" aria-modal="true" (keydown.escape)="sel.set(null)">
          <div class="mb-3 flex items-center"><h2 class="text-[18px] font-bold text-brand">Payment details</h2>
            <button class="ml-auto flex h-[32px] w-[32px] items-center justify-center rounded-full text-[22px] leading-none text-muted hover:bg-black/5 hover:text-black" aria-label="Close payment details" (click)="sel.set(null)">×</button></div>
          @if (sel(); as p) {
            <p class="mb-3 text-[18px] font-bold text-brand">{{ p.period }}</p>
            <p class="text-[13px] font-bold text-[#4b5563]">Period:</p><p class="mb-2 text-[14px]">{{ p.period }}</p>
            <p class="text-[13px] font-bold text-[#4b5563]">Amount:</p><p class="mb-2 text-[18px] font-bold text-brand">{{ p.amount | peso }}</p>
            <p class="text-[13px] font-bold text-[#4b5563]">Status:</p><p class="mb-2 text-[14px] font-bold" [style.color]="color(p.status)">{{ p.status }}</p>
            <p class="text-[13px] font-bold text-[#4b5563]">{{ p.status === 'Released' ? 'Released on:' : 'Expected release:' }}</p><p class="mb-2 text-[14px]">{{ p.releaseDate | dmy: 'Pending' }}</p>
            <p class="text-[13px] font-bold text-[#4b5563]">Payment Method:</p><p class="mb-2 text-[14px]">{{ p.paymentMethod || '-' }}</p>
            <p class="text-[13px] font-bold text-[#4b5563]">Reference Number:</p><p class="mb-2 break-all text-[14px]">{{ p.referenceNumber || '-' }}</p>
            <p class="text-[13px] font-bold text-[#4b5563]">Processed By:</p><p class="text-[14px]">{{ p.processedBy || '-' }}</p>
          }
        </aside> }
      </div>
      }
    }
  `,
})
export class ScholarPaymentsPage implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  data = signal<ScholarPayments | null>(null);
  info = signal<ScholarDashboard | null>(null);
  // Number cards at the top.
  stats = computed<StatItem[]>(() => {
    const d = this.data();
    return [
      { label: 'Total received', value: formatPeso(d?.totalReceived), sub: 'Released to you so far', tone: 'ok' },
      { label: 'Awaiting release', value: formatPeso(d?.pendingAmount), tone: 'pending', sub: 'Pending or processed' },
      { label: 'Last payment', value: formatPeso(d?.lastPayment), sub: d?.lastPaymentDate ? 'Released ' + new Date(d.lastPaymentDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'None yet' },
      { label: 'Payments', value: d?.totalPayments ?? 0 },
    ];
  });
  sel = signal<PaymentItem | null>(null);
  statusSig = signal('All'); periodSig = signal('All Periods');
  color = statusColor; tint = tint;
  get status() { return this.statusSig(); } set status(v: string) { this.statusSig.set(v); }
  get period() { return this.periodSig(); } set period(v: string) { this.periodSig.set(v); }
  // Month choices for the filter, and the rows that match the filters.
  // Filtering happens in the browser (the list is small).
  periods = computed(() => [...new Set((this.data()?.items ?? []).map((p) => p.period))]);
  filtered = computed(() => (this.data()?.items ?? []).filter((p) => (this.statusSig() === 'All' || p.status === this.statusSig()) && (this.periodSig() === 'All Periods' || p.period === this.periodSig())));

  // Reload when payments change on the server.
  constructor() {
    const rt = inject(RealtimeService);
    reloadOn([rt.paymentsChanged$], () => this.load());
  }

  ngOnInit(): void { void this.load(); }
  // Load payments. With no payments yet, also load the dashboard to show the expected next payment.
  async load(): Promise<void> { try { this.data.set(await firstValueFrom(this.api.get<ScholarPayments>('/scholar/payments'))); if (!this.data()!.totalPayments) this.info.set(await firstValueFrom(this.api.get<ScholarDashboard>('/scholar/dashboard'))); } catch (e) { void this.dlg.error(errorMessage(e)); } }
  // Download the payment history as CSV.
  // Download the payment history as an editable Word file.
  async exportDocx(): Promise<void> { try { await this.api.download('/scholar/payments/docx', {}, 'PaymentHistory.docx'); } catch (e) { void this.dlg.error(errorMessage(e), 'Export Failed'); } }
  async exportCsv(): Promise<void> { try { await this.api.download('/scholar/payments/csv', {}, 'PaymentHistory.csv'); } catch (e) { void this.dlg.error(errorMessage(e), 'Export Failed'); } }
}
