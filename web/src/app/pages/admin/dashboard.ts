import { Component, ElementRef, OnDestroy, OnInit, inject, signal, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Chart } from 'chart.js';
import { Api, errorMessage } from '../../core/api';
import { AuthService } from '../../core/auth';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, PesoPipe, relativeTime, statusColor, formatPeso } from '../../core/format';
import { ChartPoint, DashboardStats, RecentActivity, UpcomingPayment } from '../../core/models';
import { lineConfig, makeChart, pieConfig } from '../../shared/charts';
import { ScrollCue } from '../../shared/scroll-cue';
import { StatItem, StatStrip } from '../../shared/stat-strip';

@Component({
  selector: 'app-admin-dashboard',
  imports: [StatStrip, ScrollCue, PesoPipe, DatePipeShort],
  template: `
    <h1 class="text-[20pt] font-bold text-ink">Welcome back, {{ auth.user()?.name || 'Administrator' }}!</h1>
    <p class="mb-5 text-[12pt] text-[#646464]">{{ today }}</p>

    <app-stat-strip [items]="cards()" />

    <div class="grid items-start gap-4 xl:grid-cols-[470px_1fr]">
      <section class="card p-4">
        <h2 class="border-b-2 border-[#e6e6e6] pb-2 text-[14pt] font-bold text-brand">Recent Activity</h2>
        <ul class="mt-2 max-h-[260px] divide-y divide-[#f0f0f0] overflow-auto">
          @for (a of recent().slice(0, 6); track $index) {
            <li class="py-2" [class.bg-[#f8fafc]]="$index % 2 === 0">
              <p class="text-[13px] font-bold text-brand">{{ a.userName }}</p>
              <p class="line-clamp-2 text-[12px] text-[#646464]" [title]="a.details">{{ a.details }}</p>
              <p class="text-[12px] text-[#595959]">{{ rel(a.createdAt) }}</p>
            </li>
          } @empty { <li class="py-6 text-center text-[13px] text-[#595959]">No recent activity</li> }
        </ul>
      </section>

      <section class="card p-4">
        <h2 class="border-b-2 border-[#e6e6e6] pb-2 text-[14pt] font-bold text-brand">Upcoming Payments</h2>
        <div scrollCue class="grid-wrap mt-2 max-h-[260px]">
          <table class="dgrid roomy">
            <thead><tr><th>Scholar</th><th>Period</th><th>Amount</th><th>Status</th><th>Releases On</th></tr></thead>
            <tbody>
              @for (p of upcoming(); track $index) {
                <tr>
                  <td><span class="font-bold">{{ p.scholarName }}</span><span class="mt-[2px] block text-[12px] text-[#4b5563]">{{ p.scholarNumber }}</span></td><td>{{ p.period }}</td><td>{{ p.amount | peso }}</td><td><span class="font-bold" [style.color]="color(p.status)">{{ p.status }}</span></td><td>{{ p.releaseDate | dmy: 'Pending' }}</td>
                </tr>
              } @empty { <tr><td colspan="5" class="!py-6 text-center text-[#595959]">No upcoming payments</td></tr> }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div class="grid items-start gap-4 lg:grid-cols-2">
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
  cards = signal<{ label: string; value: string; icon: string; danger?: boolean; money?: boolean; hint?: string; tone?: 'pending' }[]>([]);
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
        { label: 'Total Scholars', value: String(s.totalScholars), icon: 'user-groups' },
        { label: 'Active Scholarships', value: String(s.activeScholarships), icon: 'checked', hint: 'Scholarship programs in use' },
        { label: 'Total Disbursed', value: formatPeso(s.totalDisbursed), icon: 'wallet', money: true,
          hint: s.queuedAmount > 0 ? `Released only · ${formatPeso(s.queuedAmount)} processed, awaiting release` : 'Released to scholars' },
        { label: 'Pending Payments', value: String(s.pendingPayments), icon: 'wall-clock', danger: true, tone: 'pending', hint: 'Processed, not yet released' },
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
