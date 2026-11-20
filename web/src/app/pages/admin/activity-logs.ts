import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DateTimePipe, daysAgo, today } from '../../core/format';
import { ActivityFilters, ActivityLog, ActivityStats, Paged } from '../../core/models';
import { AppIcon } from '../../shared/icon';
import { ScrollCue } from '../../shared/scroll-cue';
import { StatItem, StatStrip } from '../../shared/stat-strip';

@Component({
  selector: 'app-activity-logs',
  imports: [StatStrip, ScrollCue, AppIcon, FormsModule, DateTimePipe],
  template: `
    <app-stat-strip [items]="cards()" />

    <div class="card mb-4 flex flex-wrap items-end gap-3 p-4">
      <div><label class="field-label-b">Search</label><input class="input !w-[170px]" [(ngModel)]="search" (keyup.enter)="apply()" /></div>
      <div><label class="field-label-b">From</label><input class="input !w-[140px]" type="date" [(ngModel)]="from" (change)="apply()" /></div>
      <div><label class="field-label-b">To</label><input class="input !w-[140px]" type="date" [(ngModel)]="to" (change)="apply()" /></div>
      <div><label class="field-label-b">Action Type</label>
        <select class="input !w-[160px]" [(ngModel)]="action" (change)="apply()"><option>Hide sign-ins</option><option>All Actions</option>@for (a of filters()?.actions ?? []; track a) { <option>{{ a }}</option> }</select></div>
      <div><label class="field-label-b">User</label>
        <select class="input !w-[160px]" [(ngModel)]="user" (change)="apply()"><option>All Users</option>@for (u of filters()?.users ?? []; track u) { <option>{{ u }}</option> }</select></div>
      <div class="ml-auto flex gap-2">
        <button class="btn btn-accent" (click)="refresh()">Refresh</button>
        <button class="btn btn-gray" (click)="clearFilters()">Clear</button>
        <button class="btn btn-ok" (click)="exportCsv()"><app-icon name="file" class="h-4 w-4"></app-icon>Export Logs</button>
      </div>
    </div>

    <div class="grid items-start gap-4" [class]="sel() ? 'xl:grid-cols-[1fr_337px]' : ''">
      <section class="card overflow-hidden">
        <div scrollCue class="grid-wrap max-h-[520px]">
          <table class="dgrid">
            <thead><tr><th>ID</th><th>Timestamp</th><th>User</th><th>Role</th><th>Action</th><th>Table</th><th>Details</th><th>IP Address</th></tr></thead>
            <tbody>
              @for (l of page()?.items ?? []; track l.id; let i = $index) {
                <tr class="cursor-pointer" [class.alt]="i % 2 === 1" [class.sel]="sel()?.id === l.id" (click)="sel.set(l)">
                  <td>{{ l.id }}</td><td class="whitespace-nowrap">{{ l.createdAt | dt }}</td><td>{{ l.userName }}</td><td>{{ l.role }}</td><td class="font-bold">{{ l.actionType }}</td>
                  <td>{{ l.tableAffected }}</td><td class="wrap !min-w-[220px]">{{ l.details }}</td><td>{{ l.ipAddress }}</td>
                </tr>
              } @empty { <tr><td colspan="8" class="!py-8 text-center text-[#595959]">No activity found</td></tr> }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-center gap-2 border-t border-[#e6e6e6] py-2">
          <button class="btn btn-brand !h-[40px] !min-w-[48px]" [disabled]="pageNo() <= 1" (click)="go(1)" aria-label="First page">«</button>
          <button class="btn btn-brand !h-[40px] !min-w-[48px]" [disabled]="pageNo() <= 1" (click)="go(pageNo() - 1)" aria-label="Previous page">‹ Prev</button>
          <span class="mx-4 text-[14px]">Page {{ pageNo() }} of {{ totalPages() }}</span>
          <button class="btn btn-brand !h-[40px] !min-w-[48px]" [disabled]="pageNo() >= totalPages()" (click)="go(pageNo() + 1)" aria-label="Next page">Next ›</button>
          <button class="btn btn-brand !h-[40px] !min-w-[48px]" [disabled]="pageNo() >= totalPages()" (click)="go(totalPages())" aria-label="Last page">»</button>
        </div>
      </section>

      @if (sel()) { <aside class="card p-5">
        <h2 class="mb-3 text-[14pt] font-bold text-accent">Log Entry Details</h2>
        @if (sel(); as l) {
          <p class="mb-2 text-[13px]">Timestamp: {{ l.createdAt | dt }}</p><p class="mb-2 text-[13px]">User: {{ l.userName }}</p><p class="mb-2 text-[13px]">Action: {{ l.actionType }}</p>
          <p class="mb-2 text-[13px]">Table Affected: {{ l.tableAffected || '-' }}</p><p class="mb-3 text-[13px]">Record ID: {{ l.recordId ?? '-' }}</p>
          <p class="mb-1 text-[11pt] font-bold">Description:</p>
          <div class="min-h-[160px] whitespace-pre-wrap rounded bg-surface p-2 text-[13px]">{{ l.details }}</div>
        }
      </aside> }
    </div>
  `,
})
export class ActivityLogsPage implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  page = signal<Paged<ActivityLog> | null>(null);
  stats = signal<ActivityStats | null>(null);
  filters = signal<ActivityFilters | null>(null);
  sel = signal<ActivityLog | null>(null);
  search = ''; from = daysAgo(30); to = today(); action = 'Hide sign-ins'; user = 'All Users';
  pageNo = computed(() => this.page()?.page ?? 1);
  totalPages = computed(() => Math.max(1, Math.ceil((this.page()?.total ?? 0) / (this.page()?.pageSize ?? 25))));
  cards = computed(() => [
    { label: 'All entries', value: this.stats()?.total ?? 0, icon: 'file' },
    { label: 'Entries today', value: this.stats()?.today ?? 0, icon: 'checked' },
    { label: 'People active today', value: this.stats()?.activeUsers ?? 0, icon: 'user', hint: 'Admins and scholars with at least one logged action today' },
  ]);

  async ngOnInit(): Promise<void> {
    this.filters.set(await firstValueFrom(this.api.get<ActivityFilters>('/admin/activity-logs/filters')));
    await this.refresh();
  }

  private query(page = 1) { return { from: this.from, to: this.to, action: this.action, user: this.user, search: this.search, page }; }

  async apply(): Promise<void> { await this.go(1); }
  async go(p: number): Promise<void> {
    try { this.page.set(await firstValueFrom(this.api.get<Paged<ActivityLog>>('/admin/activity-logs', this.query(p)))); this.sel.set(null); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
  async refresh(): Promise<void> { this.stats.set(await firstValueFrom(this.api.get<ActivityStats>('/admin/activity-logs/stats'))); await this.go(1); }
  async clearFilters(): Promise<void> { this.search = ''; this.from = daysAgo(30); this.to = today(); this.action = 'Hide sign-ins'; this.user = 'All Users'; await this.go(1); }

  async exportCsv(): Promise<void> {
    try { const { page: _page, ...q } = this.query(); await this.api.download('/admin/activity-logs/csv', q, 'ActivityLogs.csv'); } catch (e) { void this.dlg.error(errorMessage(e), 'Export error'); }
  }
}
