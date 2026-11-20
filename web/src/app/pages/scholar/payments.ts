import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, PesoPipe, statusColor } from '../../core/format';
import { PaymentItem, ScholarPayments } from '../../core/models';
import { AppIcon } from '../../shared/icon';

@Component({
  selector: 'app-scholar-payments',
  imports: [AppIcon, FormsModule, PesoPipe, DatePipeShort],
  template: `
    <div class="mb-5 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
      <div class="card flex h-[110px] items-center gap-4 px-5"><app-icon name="dollar" class="card-icon h-[50px] w-[50px]"></app-icon><div><p class="text-[12pt] font-bold text-label">Total Received</p><p class="text-[24px] font-bold text-brand">{{ data()?.totalReceived | peso: 0 }}</p></div></div>
      <div class="card flex h-[110px] items-center gap-4 px-5"><app-icon name="wall-clock" class="card-icon h-[50px] w-[50px]"></app-icon><div><p class="text-[12pt] font-bold text-label">Pending Amount</p><p class="text-[24px] font-bold text-warn">{{ data()?.pendingAmount | peso: 0 }}</p></div></div>
      <div class="card flex h-[110px] items-center gap-4 px-5"><app-icon name="wallet" class="card-icon h-[50px] w-[50px]"></app-icon><div><p class="text-[12pt] font-bold text-label">Last Payment</p><p class="text-[24px] font-bold text-brand">{{ data()?.lastPayment | peso: 0 }}</p><p class="text-[9pt] text-muted">{{ data()?.lastPaymentDate | dmy: '' }}</p></div></div>
      <div class="card flex h-[110px] items-center gap-4 px-5"><app-icon name="file" class="card-icon h-[50px] w-[50px]"></app-icon><div><p class="text-[12pt] font-bold text-label">Total Payments</p><p class="text-[30px] font-bold text-brand">{{ data()?.totalPayments ?? 0 }}</p></div></div>
    </div>

    <div class="card mb-4 flex flex-wrap items-center gap-3 p-4">
      <label class="text-[11pt] font-bold text-label">Status:</label>
      <select class="input !w-[150px]" [(ngModel)]="status"><option>All</option><option>Pending</option><option>Processed</option><option>Released</option><option>Failed</option></select>
      <label class="text-[11pt] font-bold text-label">Period:</label>
      <select class="input !w-[170px]" [(ngModel)]="period"><option>All Periods</option>@for (p of periods(); track p) { <option>{{ p }}</option> }</select>
      <div class="ml-auto flex gap-2"><button class="btn btn-gray" (click)="status = 'All'; period = 'All Periods'">Clear</button><button class="btn btn-brand" (click)="load()">Refresh</button>
        <button class="btn btn-ok" (click)="exportCsv()"><app-icon name="file" class="h-4 w-4"></app-icon>Export</button></div>
    </div>

    <div class="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section class="card overflow-hidden">
        <div class="grid-wrap max-h-[520px]"><table class="dgrid">
          <thead><tr><th>ID</th><th>Period</th><th>Amount</th><th>Status</th><th>Release Date</th><th>Method</th></tr></thead>
          <tbody>@for (p of filtered(); track p.id; let i = $index) {
            <tr class="cursor-pointer" [class.alt]="i % 2 === 1" [class.sel]="sel()?.id === p.id" (click)="sel.set(p)">
              <td>{{ p.id }}</td><td>{{ p.period }}</td><td>{{ p.amount | peso }}</td><td><span class="font-bold" [style.color]="color(p.status)">{{ p.status }}</span></td><td>{{ p.releaseDate | dmy: 'Pending' }}</td><td>{{ p.paymentMethod }}</td></tr>
          } @empty { <tr><td colspan="6" class="!py-8 text-center text-[#969696]">No payments found</td></tr> }</tbody></table></div>
        <p class="px-3 py-2 text-[9pt] text-muted">Showing {{ filtered().length }} records</p>
      </section>
      <aside class="card p-5">
        <h2 class="mb-3 text-[16pt] font-bold text-brand">Payment Details</h2>
        @if (sel(); as p) {
          <p class="mb-3 text-[14pt] font-bold text-brand">#{{ p.id }}</p>
          <p class="text-[10pt] font-bold text-label">Period:</p><p class="mb-2 text-[12pt]">{{ p.period }}</p>
          <p class="text-[10pt] font-bold text-label">Amount:</p><p class="mb-2 text-[18pt] font-bold text-brand">{{ p.amount | peso }}</p>
          <p class="text-[10pt] font-bold text-label">Status:</p><p class="mb-2 text-[12pt] font-bold" [style.color]="color(p.status)">{{ p.status }}</p>
          <p class="text-[10pt] font-bold text-label">Release Date:</p><p class="mb-2 text-[12pt]">{{ p.releaseDate | dmy: 'Pending' }}</p>
          <p class="text-[10pt] font-bold text-label">Payment Method:</p><p class="mb-2 text-[12pt]">{{ p.paymentMethod || '-' }}</p>
          <p class="text-[10pt] font-bold text-label">Reference Number:</p><p class="mb-2 break-all text-[12pt]">{{ p.referenceNumber || '-' }}</p>
          <p class="text-[10pt] font-bold text-label">Processed By:</p><p class="text-[12pt]">{{ p.processedBy || '-' }}</p>
        } @else { <p class="text-[12px] text-muted">Select a payment to see its details.</p> }
      </aside>
    </div>
  `,
})
export class ScholarPaymentsPage implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  data = signal<ScholarPayments | null>(null);
  sel = signal<PaymentItem | null>(null);
  statusSig = signal('All'); periodSig = signal('All Periods');
  color = statusColor;
  get status() { return this.statusSig(); } set status(v: string) { this.statusSig.set(v); }
  get period() { return this.periodSig(); } set period(v: string) { this.periodSig.set(v); }
  periods = computed(() => [...new Set((this.data()?.items ?? []).map((p) => p.period))]);
  filtered = computed(() => (this.data()?.items ?? []).filter((p) => (this.statusSig() === 'All' || p.status === this.statusSig()) && (this.periodSig() === 'All Periods' || p.period === this.periodSig())));

  ngOnInit(): void { void this.load(); }
  async load(): Promise<void> { try { this.data.set(await firstValueFrom(this.api.get<ScholarPayments>('/scholar/payments'))); } catch (e) { void this.dlg.error(errorMessage(e)); } }
  async exportCsv(): Promise<void> { try { await this.api.download('/scholar/payments/csv', {}, 'PaymentHistory.csv'); } catch (e) { void this.dlg.error(errorMessage(e), 'Export Failed'); } }
}
