// =====================================================================
// dashboard.ts - scholar home page (/scholar/dashboard).
// Shows money received, next payment, scholarship, compliance rate,
// recent payments, requirements and notifications.
// API: GET /api/scholar/dashboard (ScholarPortalController -> ScholarPortalService).
// Live: reloads on new notifications, payment changes or compliance changes.
// =====================================================================
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RealtimeService, reloadOn } from '../../core/realtime';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, NOTIFICATION_COLORS, PesoPipe, relativeTime, statusColor, RequirementNamePipe, formatPeso, notificationIcon, tint } from '../../core/format';
import { Avatar } from '../../shared/avatar';
import { ScholarDashboard } from '../../core/models';
import { AppIcon } from '../../shared/icon';
import { StatItem, StatStrip } from '../../shared/stat-strip';

@Component({
  selector: 'app-scholar-dashboard',
  imports: [Avatar, StatStrip, RequirementNamePipe, AppIcon, RouterLink, PesoPipe, DatePipeShort],
  template: `
    @if (d(); as d) {
      <!-- Greeting with the scholar's picture -->
      <div class="mb-5 flex items-center gap-4">
        <app-avatar path="/me/picture" alt="" class="h-[56px] w-[56px]" />
        <div class="min-w-0">
          <h1 class="text-[21px] font-bold leading-tight text-brand md:text-[24px]">{{ greeting }}, {{ firstName(d.scholarName) }}!</h1>
          <p class="text-[14px] text-[#4b5563]">{{ today }} · {{ d.scholarNumber }}</p>
        </div>
      </div>

      @if (d.documentsDue > 0) {
        <div class="mb-5 flex flex-wrap items-center gap-4 rounded-lg border-l-4 border-warn bg-[#fff8e6] px-5 py-4" role="status">
          <app-icon name="alert" class="h-[32px] w-[32px] text-[#8a5300]"></app-icon>
          <div class="min-w-[200px] flex-1">
            <p class="text-[14px] font-bold text-brand">{{ d.documentsDue }} {{ d.documentsDue === 1 ? 'document needs' : 'documents need' }} to be submitted{{ d.documentsDueDate ? ' by ' + (d.documentsDueDate | dmy) : '' }}</p>
            <p class="text-[13px] text-[#4b5563]">Your stipend can only be released once your requirements are complete.</p>
          </div>
          <a routerLink="/scholar/compliance" class="btn btn-ok !h-[40px] !px-5">Upload documents</a>
        </div>
      }
      <app-stat-strip [items]="stats(d)" />

      <div class="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <div class="space-y-4">
          <!-- Recent payments: a short list (no table, so nothing gets cut off on small screens) -->
          <section class="card p-5">
            <div class="mb-2 flex items-center"><h2 class="text-[18px] font-bold text-brand">Recent payments</h2><a routerLink="/scholar/payments" class="ml-auto text-[13px] font-bold text-accent hover:underline">View all →</a></div>
            <ul class="divide-y divide-[#eeeeee]">
              @for (p of d.recentPayments.slice(0, 4); track p.id) {
                <li class="flex items-center gap-3 py-3">
                  <span class="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full" [style.background]="tint(color(p.status))" [style.color]="color(p.status)"><app-icon name="wallet" class="h-5 w-5"></app-icon></span>
                  <div class="min-w-0 flex-1"><p class="text-[14px] font-bold text-ink">{{ p.period }}</p>
                    <p class="text-[12px] text-[#4b5563]">{{ p.status === 'Released' ? 'Released' : 'Expected' }} {{ p.releaseDate | dmy: 'date pending' }}</p></div>
                  <div class="text-right"><p class="text-[14px] font-bold text-ink">{{ p.amount | peso }}</p>
                    <span class="rounded-full px-2 py-[1px] text-[11px] font-bold" [style.background]="tint(color(p.status))" [style.color]="color(p.status)">{{ p.status }}</span></div>
                </li>
              } @empty { <li class="py-6 text-center text-[13px] text-[#4b5563]">No payments yet. They appear here once the Scholarship Office processes your stipend.</li> }
            </ul>
          </section>

          <!-- Compliance: a progress bar, then only what still needs attention -->
          <section class="card p-5">
            <div class="mb-3 flex items-center"><h2 class="text-[18px] font-bold text-brand">Requirements</h2><a routerLink="/scholar/compliance" class="ml-auto text-[13px] font-bold text-accent hover:underline">View all →</a></div>
            <div class="mb-1 flex justify-between text-[13px]"><span class="text-[#4b5563]">Completed</span><b class="text-ink">{{ d.complianceRate }}%</b></div>
            <div class="mb-4 h-[8px] overflow-hidden rounded-full bg-[#e6e6e6]"><div class="h-full rounded-full bg-ok transition-[width]" [style.width.%]="d.complianceRate"></div></div>
            @if (d.documentsDue === 0 && d.complianceRate >= 100) {
              <div class="flex items-center gap-3 rounded-lg bg-[#eef7f0] px-4 py-3 text-[14px] text-ok"><app-icon name="checked" class="h-6 w-6"></app-icon><b>All your requirements are approved.</b></div>
            } @else {
              @for (c of d.compliance; track c.id) {
                <div class="mb-2 flex items-center gap-3 rounded-lg bg-[#fafafa] px-4 py-3"><app-icon name="file" class="h-[26px] w-[26px] shrink-0 text-brand"></app-icon>
                  <div class="min-w-0 flex-1"><p class="text-[14px] font-bold text-brand">{{ c.requirementType | reqName }}</p><p class="text-[12px] text-[#4b5563]">Due {{ c.dueDate | dmy }}</p></div>
                  <span class="rounded-full px-2 py-[2px] text-[12px] font-bold" [style.background]="tint(color(c.status))" [style.color]="color(c.status)">{{ c.status }}</span></div>
              } @empty { <p class="py-4 text-center text-[13px] text-[#4b5563]">No requirements yet.</p> }
            }
          </section>
        </div>

        <!-- Latest notifications, with an icon and colour per type and a dot when unread -->
        <section class="card p-5">
          <div class="mb-2 flex items-center"><h2 class="text-[18px] font-bold text-brand">Latest notifications</h2><a routerLink="/scholar/notifications" class="ml-auto text-[13px] font-bold text-accent hover:underline">View all →</a></div>
          <ul class="divide-y divide-[#eeeeee]">
            @for (n of d.notifications; track n.id) {
              <li class="flex gap-3 py-3">
                <span class="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full" [style.background]="tint(tcolor(n.type))" [style.color]="tcolor(n.type)"><app-icon [name]="icon(n.type, n.title)" class="h-5 w-5"></app-icon></span>
                <div class="min-w-0 flex-1">
                  <p class="flex items-start gap-2 text-[14px] text-brand" [class.font-bold]="!n.isRead">@if (!n.isRead) { <span class="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-[#0b5cad]" aria-label="Unread"></span> }<span>{{ n.title }}</span></p>
                  <p class="line-clamp-2 whitespace-pre-line text-[13px] text-[#4b5563]">{{ n.message }}</p>
                  <p class="mt-1 text-[12px] text-[#6b7280] sm:hidden">{{ rel(n.dateCreated) }}</p>
                </div>
                <span class="hidden shrink-0 whitespace-nowrap text-[12px] text-[#4b5563] sm:inline">{{ rel(n.dateCreated) }}</span>
              </li>
            } @empty { <li class="py-6 text-center text-[13px] text-[#4b5563]">No notifications yet.</li> }
          </ul>
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
  color = statusColor; rel = relativeTime; tcolor = (t: string) => NOTIFICATION_COLORS[t] ?? '#646464'; tint = tint; icon = notificationIcon;
  // "Good morning" / "Good afternoon" / "Good evening", by the hour.
  greeting = ((h) => (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'))(new Date().getHours());
  firstName = (full: string) => full.split(' ')[0] || full;
  // The four number cards at the top.
  stats(d: ScholarDashboard): StatItem[] {
    return [
      { label: 'Stipend received', value: formatPeso(d.totalStipend), tone: 'ok' },
      { label: 'Next payment', value: formatPeso(d.nextPaymentAmount ?? d.scholarshipStipend), sub: d.nextPaymentDate + ' · ' + d.nextPaymentNote },
      { label: 'Scholarship', value: d.scholarshipName, compact: true, sub: formatPeso(d.scholarshipStipend) + ' per payment' },
      { label: 'Compliance rate', value: d.complianceRate + '%', progress: d.complianceRate },
    ];
  }

  // Reload the page when the server pushes a related change.
  constructor() {
    const rt = inject(RealtimeService);
    reloadOn([rt.notificationReceived$, rt.paymentsChanged$, rt.complianceChanged$], () => this.load());
  }

  // Load once when the page opens.
  ngOnInit(): void { void this.load(); }
  async load(): Promise<void> { try { this.d.set(await firstValueFrom(this.api.get<ScholarDashboard>('/scholar/dashboard'))); } catch (e) { void this.dlg.error(errorMessage(e)); } }
}
