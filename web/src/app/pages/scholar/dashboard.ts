import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, NOTIFICATION_COLORS, PesoPipe, relativeTime, statusColor, RequirementNamePipe, formatPeso } from '../../core/format';
import { ScholarDashboard } from '../../core/models';
import { AppIcon } from '../../shared/icon';
import { ScrollCue } from '../../shared/scroll-cue';
import { StatItem, StatStrip } from '../../shared/stat-strip';

@Component({
  selector: 'app-scholar-dashboard',
  imports: [StatStrip, RequirementNamePipe, ScrollCue, AppIcon, RouterLink, PesoPipe, DatePipeShort],
  template: `
    <h1 class="text-[24px] font-bold text-brand">Welcome back!</h1>
    <p class="mb-5 text-[14px] text-[#4b5563]">{{ today }}</p>

    @if (d(); as d) {
      @if (d.documentsDue > 0) {
        <div class="mb-6 flex flex-wrap items-center gap-4 rounded-lg border-l-4 border-warn bg-[#fff8e6] px-5 py-4" role="status">
          <app-icon name="alert" class="h-[32px] w-[32px] text-[#8a5300]"></app-icon>
          <div class="min-w-[220px] flex-1">
            <p class="text-[14px] font-bold text-brand">{{ d.documentsDue }} {{ d.documentsDue === 1 ? 'document needs' : 'documents need' }} to be submitted{{ d.documentsDueDate ? ' by ' + (d.documentsDueDate | dmy) : '' }}</p>
            <p class="text-[13px] text-[#4b5563]">Your stipend can only be released once your requirements are complete.</p>
          </div>
          <a routerLink="/scholar/compliance" class="btn btn-ok !h-[40px] !px-5">Upload documents</a>
        </div>
      }
      <app-stat-strip [items]="stats(d)" />

      <div class="grid items-start gap-4 xl:grid-cols-[1fr_1fr]">
        <div class="space-y-4">
          <section class="card p-5">
            <div class="mb-3 flex items-center"><h2 class="text-[18px] font-bold text-brand">Recent Payments</h2><a routerLink="/scholar/payments" class="btn btn-brand ml-auto !h-[30px] !text-[12px]">View All</a></div>
            <div scrollCue class="grid-wrap max-h-[270px]"><table class="dgrid"><thead><tr><th>Period</th><th>Amount</th><th>Status</th><th>Release Date</th></tr></thead>
              <tbody>@for (p of d.recentPayments; track p.id; let i = $index) { <tr [class.alt]="i % 2 === 1"><td>{{ p.period }}</td><td>{{ p.amount | peso }}</td>
                <td><span class="font-bold" [style.color]="color(p.status)">{{ p.status }}</span></td><td>{{ p.releaseDate | dmy: 'Pending' }}</td></tr>
              } @empty { <tr><td colspan="4" class="!py-6 text-center text-[#4b5563]">No payments yet</td></tr> }</tbody></table></div>
          </section>
          <section class="card p-5">
            <div class="mb-3 flex items-center"><h2 class="text-[18px] font-bold text-brand">Compliance Overview</h2><a routerLink="/scholar/compliance" class="btn btn-brand ml-auto !h-[30px] !text-[12px]">View All</a></div>
            @for (c of d.compliance; track c.id) {
              <div class="mb-3 flex items-center gap-3 rounded-lg bg-[#fafafa] px-4 py-3"><app-icon name="file" class="h-[35px] w-[40px]"></app-icon>
                <div class="flex-1"><p class="text-[14px] font-bold text-brand">{{ c.requirementType | reqName }}</p><p class="text-[12px] text-[#4b5563]">Due: {{ c.dueDate | dmy }}</p></div>
                <span class="text-[13px] font-bold" [style.color]="color(c.status)">{{ c.status }}</span></div>
            } @empty { <p class="py-4 text-center text-[13px] text-[#4b5563]">No requirements</p> }
          </section>
        </div>
        <section class="card p-5">
          <h2 class="mb-3 text-[18px] font-bold text-brand">Recent Notifications</h2>
          @for (n of d.notifications; track n.id) {
            <div class="mb-3 flex gap-3 rounded-lg bg-[#fafafa] px-4 py-3" [class.border-l-4]="!n.isRead" [style.border-color]="tcolor(n.type)">
              <app-icon name="bell" class="card-icon h-[40px] w-[40px]"></app-icon>
              <div class="min-w-0 flex-1"><p class="text-[14px] font-bold text-brand">{{ n.title }}</p><p class="line-clamp-2 whitespace-pre-line text-[13px] text-[#4b5563]">{{ n.message }}</p></div>
              <span class="whitespace-nowrap text-[12px] text-[#4b5563]">{{ rel(n.dateCreated) }}</span></div>
          } @empty { <p class="py-4 text-center text-[13px] text-[#4b5563]">No notifications</p> }
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
  stats(d: ScholarDashboard): StatItem[] {
    return [
      { label: 'Stipend received', value: formatPeso(d.totalStipend), tone: 'ok' },
      { label: 'Next payment', value: formatPeso(d.nextPaymentAmount ?? d.scholarshipStipend), sub: d.nextPaymentDate + ' · ' + d.nextPaymentNote },
      { label: 'Scholarship', value: d.scholarshipName },
      { label: 'Compliance rate', value: d.complianceRate + '%', progress: d.complianceRate },
    ];
  }

  async ngOnInit(): Promise<void> { try { this.d.set(await firstValueFrom(this.api.get<ScholarDashboard>('/scholar/dashboard'))); } catch (e) { void this.dlg.error(errorMessage(e)); } }
}
