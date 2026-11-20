import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, PesoPipe, statusColor, formatPeso } from '../../core/format';
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
  
      <div class="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <label class="text-[14px] font-bold text-[#4b5563]">Status:</label>
        <select class="input !w-[150px]" [(ngModel)]="status"><option>All</option><option>Pending</option><option>Processed</option><option>Released</option><option>Failed</option></select>
        <label class="text-[14px] font-bold text-[#4b5563]">Period:</label>
        <select class="input !w-[170px]" [(ngModel)]="period"><option>All Periods</option>@for (p of periods(); track p) { <option>{{ p }}</option> }</select>
        <div class="ml-auto flex gap-2"><button class="btn btn-gray" (click)="status = 'All'; period = 'All Periods'">Clear</button><button class="btn btn-brand" (click)="load()">Refresh</button>
          <button class="btn btn-ok" (click)="exportCsv()"><app-icon name="file" class="h-4 w-4"></app-icon>Export</button></div>
      </div>
  
      <div class="grid items-start gap-5" [class]="sel() ? 'xl:grid-cols-[1fr_340px]' : ''">
        <section class="card overflow-hidden">
          <div scrollCue class="grid-wrap max-h-[520px]"><table class="dgrid">
            <thead><tr><th>ID</th><th>Period</th><th>Amount</th><th>Status</th><th>Release Date</th><th>Method</th></tr></thead>
            <tbody>@for (p of filtered(); track p.id; let i = $index) {
              <tr class="cursor-pointer" [class.alt]="i % 2 === 1" [class.sel]="sel()?.id === p.id" (click)="sel.set(p)">
                <td>{{ p.id }}</td><td>{{ p.period }}</td><td>{{ p.amount | peso }}</td><td><span class="font-bold" [style.color]="color(p.status)">{{ p.status }}</span></td><td>{{ p.releaseDate | dmy: 'Pending' }}</td><td>{{ p.paymentMethod }}</td></tr>
            } @empty { <tr><td colspan="6" class="!py-8 text-center text-[#4b5563]">No payments found</td></tr> }</tbody></table></div>
          <p class="px-3 py-2 text-[12px] text-[#4b5563]">Showing {{ filtered().length }} {{ filtered().length === 1 ? 'record' : 'records' }}</p>
        </section>
        @if (sel()) { <aside class="card p-5">
          <h2 class="mb-3 text-[18px] font-bold text-brand">Payment Details</h2>
          @if (sel(); as p) {
            <p class="mb-3 text-[18px] font-bold text-brand">#{{ p.id }}</p>
            <p class="text-[13px] font-bold text-[#4b5563]">Period:</p><p class="mb-2 text-[14px]">{{ p.period }}</p>
            <p class="text-[13px] font-bold text-[#4b5563]">Amount:</p><p class="mb-2 text-[18px] font-bold text-brand">{{ p.amount | peso }}</p>
            <p class="text-[13px] font-bold text-[#4b5563]">Status:</p><p class="mb-2 text-[14px] font-bold" [style.color]="color(p.status)">{{ p.status }}</p>
            <p class="text-[13px] font-bold text-[#4b5563]">Release Date:</p><p class="mb-2 text-[14px]">{{ p.releaseDate | dmy: 'Pending' }}</p>
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
  color = statusColor;
  get status() { return this.statusSig(); } set status(v: string) { this.statusSig.set(v); }
  get period() { return this.periodSig(); } set period(v: string) { this.periodSig.set(v); }
  periods = computed(() => [...new Set((this.data()?.items ?? []).map((p) => p.period))]);
  filtered = computed(() => (this.data()?.items ?? []).filter((p) => (this.statusSig() === 'All' || p.status === this.statusSig()) && (this.periodSig() === 'All Periods' || p.period === this.periodSig())));

  ngOnInit(): void { void this.load(); }
  async load(): Promise<void> { try { this.data.set(await firstValueFrom(this.api.get<ScholarPayments>('/scholar/payments'))); if (!this.data()!.totalPayments) this.info.set(await firstValueFrom(this.api.get<ScholarDashboard>('/scholar/dashboard'))); } catch (e) { void this.dlg.error(errorMessage(e)); } }
  async exportCsv(): Promise<void> { try { await this.api.download('/scholar/payments/csv', {}, 'PaymentHistory.csv'); } catch (e) { void this.dlg.error(errorMessage(e), 'Export Failed'); } }
}
