import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, NOTIFICATION_COLORS, PesoPipe, relativeTime, statusColor } from '../../core/format';
import { ScholarDashboard } from '../../core/models';

@Component({
  selector: 'app-scholar-dashboard',
  imports: [RouterLink, PesoPipe, DatePipeShort],
  template: `
    <h1 class="text-[22pt] font-bold text-brand">Welcome back! 👋</h1>
    <p class="mb-5 text-[13pt] text-[#646464]">{{ today }}</p>

    @if (d(); as d) {
      <div class="mb-6 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
        <div class="card flex h-[140px] items-center gap-4 px-5"><img src="assets/wallet.png" alt="" class="h-[60px] w-[55px] object-contain" />
          <div><p class="text-[13pt] font-bold text-label">Total Stipend Received</p><p class="text-[30px] font-bold text-brand">{{ d.totalStipend | peso: 0 }}</p></div></div>
        <div class="card flex h-[140px] items-center gap-4 px-5"><img src="assets/dollar.png" alt="" class="h-[60px] w-[55px] object-contain" />
          <div><p class="text-[13pt] font-bold text-label">Next Payment</p><p class="text-[30px] font-bold text-brand">{{ d.scholarshipStipend | peso: 0 }}</p><p class="text-[10pt] text-[#646464]">{{ d.nextPaymentDate }}</p></div></div>
        <div class="card flex h-[140px] items-center gap-4 px-5"><img src="assets/scholar.png" alt="" class="h-[60px] w-[55px] object-contain" />
          <div><p class="text-[13pt] font-bold text-label">Scholarship Type</p><p class="text-[18pt] font-bold text-brand" [title]="d.scholarshipName">{{ d.scholarshipName.length > 20 ? d.scholarshipName.slice(0, 18) + '...' : d.scholarshipName }}</p></div></div>
        <div class="card flex h-[140px] items-center gap-4 px-5"><img src="assets/file.png" alt="" class="h-[60px] w-[55px] object-contain" />
          <div class="flex-1"><p class="text-[13pt] font-bold text-label">Compliance Rate</p><p class="text-[30px] font-bold text-brand">{{ d.complianceRate }}%</p>
            <div class="h-[10px] w-full max-w-[200px] overflow-hidden rounded bg-[#e6e6e6]"><div class="h-full bg-ok" [style.width.%]="d.complianceRate"></div></div></div></div>
      </div>

      <div class="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div class="space-y-6">
          <section class="card p-5">
            <div class="mb-3 flex items-center"><h2 class="text-[16pt] font-bold text-brand">Recent Payments</h2><a routerLink="/scholar/payments" class="btn btn-brand ml-auto !h-[30px] !text-[12px]">View All</a></div>
            <div class="grid-wrap max-h-[270px]"><table class="grid"><thead><tr><th>Period</th><th>Amount</th><th>Status</th><th>Release Date</th></tr></thead>
              <tbody>@for (p of d.recentPayments; track p.id; let i = $index) { <tr [class.alt]="i % 2 === 1"><td>{{ p.period }}</td><td>{{ p.amount | peso }}</td>
                <td><span class="font-bold" [style.color]="color(p.status)">{{ p.status }}</span></td><td>{{ p.releaseDate | dmy: 'Pending' }}</td></tr>
              } @empty { <tr><td colspan="4" class="!py-6 text-center text-[#969696]">No payments yet</td></tr> }</tbody></table></div>
          </section>
          <section class="card p-5">
            <div class="mb-3 flex items-center"><h2 class="text-[16pt] font-bold text-brand">Compliance Overview</h2><a routerLink="/scholar/compliance" class="btn btn-brand ml-auto !h-[30px] !text-[12px]">View All</a></div>
            @for (c of d.compliance; track c.id) {
              <div class="mb-3 flex items-center gap-3 rounded-lg bg-[#fafafa] px-4 py-3"><img src="assets/file.png" alt="" class="h-[35px] w-[40px] object-contain" />
                <div class="flex-1"><p class="text-[11pt] font-bold text-brand">{{ c.requirementType }}</p><p class="text-[9pt] text-[#646464]">Due: {{ c.dueDate | dmy }}</p></div>
                <span class="text-[10pt] font-bold" [style.color]="color(c.status)">{{ c.status }}</span></div>
            } @empty { <p class="py-4 text-center text-[13px] text-[#969696]">No requirements</p> }
          </section>
        </div>
        <section class="card p-5">
          <h2 class="mb-3 text-[16pt] font-bold text-brand">Recent Notifications</h2>
          @for (n of d.notifications; track n.id) {
            <div class="mb-3 flex gap-3 rounded-lg bg-[#fafafa] px-4 py-3" [class.border-l-4]="!n.isRead" [style.border-color]="tcolor(n.type)">
              <img src="assets/bell.png" alt="" class="h-[40px] w-[40px] object-contain" />
              <div class="min-w-0 flex-1"><p class="text-[11pt] font-bold text-brand">{{ n.title }}</p><p class="line-clamp-2 text-[10pt] text-[#555]">{{ n.message }}</p></div>
              <span class="whitespace-nowrap text-[9pt] text-[#969696]">{{ rel(n.dateCreated) }}</span></div>
          } @empty { <p class="py-4 text-center text-[13px] text-[#969696]">No notifications</p> }
          <a routerLink="/scholar/notifications" class="btn btn-brand mt-2 !h-[30px] !text-[12px]">View All</a>
        </section>
      </div>
    }
  `,
})
export class ScholarDashboardPage implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  d = signal<ScholarDashboard | null>(null);
  today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  color = statusColor; rel = relativeTime; tcolor = (t: string) => NOTIFICATION_COLORS[t] ?? '#646464';
  async ngOnInit(): Promise<void> { try { this.d.set(await firstValueFrom(this.api.get<ScholarDashboard>('/scholar/dashboard'))); } catch (e) { void this.dlg.error(errorMessage(e)); } }
}
