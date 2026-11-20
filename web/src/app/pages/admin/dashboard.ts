import { Component, ElementRef, OnDestroy, OnInit, inject, signal, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Chart } from 'chart.js';
import { Api, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, PesoPipe, relativeTime, statusColor } from '../../core/format';
import { ChartPoint, DashboardStats, RecentActivity, UpcomingPayment } from '../../core/models';
import { lineConfig, makeChart, pieConfig } from '../../shared/charts';

@Component({
  selector: 'app-admin-dashboard',
  imports: [PesoPipe, DatePipeShort],
  template: `
    <h1 class="text-[20pt] font-bold text-ink">Welcome back, {{ auth.user()?.name || 'Administrator' }}! 👋</h1>
    <p class="mb-5 text-[12pt] text-[#646464]">{{ today }}</p>

    <div class="mb-6 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-6">
      @for (c of cards(); track c.label) {
        <div class="card flex h-[130px] items-center gap-4 px-5">
          <img [src]="'assets/' + c.icon" alt="" class="h-[55px] w-[50px] object-contain" />
          <div>
            <p class="text-[12pt] font-bold text-label">{{ c.label }}</p>
            <p class="font-bold" [class.text-brand]="!c.danger" [class.text-danger]="c.danger" [class.text-[32px]]="!c.money" [class.text-[28px]]="c.money">{{ c.value }}</p>
          </div>
        </div>
      }
    </div>

    <div class="mb-6 grid gap-6 xl:grid-cols-[470px_1fr]">
      <section class="card p-4">
        <h2 class="border-b-2 border-[#e6e6e6] pb-2 text-[14pt] font-bold text-brand">Recent Activity</h2>
        <ul class="mt-2 max-h-[260px] divide-y divide-[#f0f0f0] overflow-auto">
          @for (a of recent(); track $index) {
            <li class="py-2" [class.bg-[#f8fafc]]="$index % 2 === 0">
              <p class="text-[13px] font-bold text-brand">{{ a.userName }}</p>
              <p class="truncate text-[12px] text-[#646464]" [title]="a.details">{{ a.details }}</p>
              <p class="text-[11px] text-[#969696]">{{ rel(a.createdAt) }}</p>
            </li>
          } @empty { <li class="py-6 text-center text-[13px] text-[#969696]">No recent activity</li> }
        </ul>
      </section>

      <section class="card p-4">
        <h2 class="border-b-2 border-[#e6e6e6] pb-2 text-[14pt] font-bold text-brand">Upcoming Payments</h2>
        <div class="grid-wrap mt-2 max-h-[260px]">
          <table class="grid">
            <thead><tr><th>Scholar</th><th>Period</th><th>Amount</th><th>Status</th><th>Release Date</th></tr></thead>
            <tbody>
              @for (p of upcoming(); track $index) {
                <tr [style.color]="color(p.status)">
                  <td>{{ p.scholarName }}</td><td>{{ p.scholarNumber }}</td><td>{{ p.amount | peso }}</td><td>{{ p.status }}</td><td>{{ p.releaseDate | dmy: 'Pending' }}</td>
                </tr>
              } @empty { <tr><td colspan="5" class="!py-6 text-center text-[#969696]">No upcoming payments</td></tr> }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <section class="card p-4"><h2 class="mb-2 text-[14pt] font-bold text-brand">Scholarship Distribution</h2><div class="h-[260px]"><canvas #pie></canvas></div></section>
      <section class="card p-4"><h2 class="mb-2 text-[14pt] font-bold text-brand">Monthly Disbursements</h2><div class="h-[260px]"><canvas #line></canvas></div></section>
    </div>
  `,
})
export class AdminDashboardPage implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private api = inject(Api);
  private dlg = inject(DialogService);
  private pieEl = viewChild<ElementRef<HTMLCanvasElement>>('pie');
  private lineEl = viewChild<ElementRef<HTMLCanvasElement>>('line');
  private charts: Chart[] = [];

  today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  cards = signal<{ label: string; value: string; icon: string; danger?: boolean; money?: boolean }[]>([]);
  recent = signal<RecentActivity[]>([]);
  upcoming = signal<UpcomingPayment[]>([]);
  color = statusColor;
  rel = relativeTime;

  async ngOnInit(): Promise<void> {
    try {
      const [s, r, u, d, m] = await Promise.all([
        firstValueFrom(this.api.get<DashboardStats>('/admin/dashboard/stats')),
        firstValueFrom(this.api.get<RecentActivity[]>('/admin/dashboard/recent-activity')),
        firstValueFrom(this.api.get<UpcomingPayment[]>('/admin/dashboard/upcoming-payments')),
        firstValueFrom(this.api.get<ChartPoint[]>('/admin/dashboard/scholarship-distribution')),
        firstValueFrom(this.api.get<ChartPoint[]>('/admin/dashboard/monthly-disbursement')),
      ]);
      this.cards.set([
        { label: 'Total Scholars', value: String(s.totalScholars), icon: 'user-groups.png' },
        { label: 'Active Scholarships', value: String(s.activeScholarships), icon: 'checked.png' },
        { label: 'Total Disbursed', value: '₱' + s.totalDisbursed.toLocaleString('en-US', { maximumFractionDigits: 0 }), icon: 'wallet.png', money: true },
        { label: 'Pending Payments', value: String(s.pendingPayments), icon: 'wall-clock.png', danger: true },
      ]);
      this.recent.set(r); this.upcoming.set(u);
      setTimeout(async () => {
        const pe = this.pieEl()?.nativeElement, le = this.lineEl()?.nativeElement;
        if (pe) this.charts.push(await makeChart(pe, pieConfig(d.map((x) => x.label), d.map((x) => x.value))));
        if (le) this.charts.push(await makeChart(le, lineConfig(m.map((x) => x.label), m.map((x) => x.value))));
      });
    } catch (e) { void this.dlg.error(errorMessage(e), 'Dashboard'); }
  }

  ngOnDestroy(): void { this.charts.forEach((c) => c.destroy()); }
}
