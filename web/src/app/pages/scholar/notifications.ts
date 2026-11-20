import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DateTimePipe, NOTIFICATION_COLORS, relativeTime } from '../../core/format';
import { ScholarNotification, ScholarNotifications } from '../../core/models';
import { AppIcon } from '../../shared/icon';
import { StatItem, StatStrip } from '../../shared/stat-strip';

@Component({
  selector: 'app-scholar-notifications',
  imports: [StatStrip, AppIcon, FormsModule, DateTimePipe],
  template: `
    @if (data(); as d) {
      @if (d.total === 0 && !filtersActive()) {
        <section class="card mx-auto mt-6 max-w-[640px] p-10 text-center">
          <app-icon name="bell" class="card-icon mx-auto mb-4 h-[64px] w-[64px]"></app-icon>
          <h2 class="mb-2 text-[18px] font-bold text-brand">You're all caught up</h2>
          <p class="text-[14px] text-[#4b5563]">Nothing here yet. When the Scholarship Office sends you a reminder, a payment update or an announcement, it will show up on this page.</p>
        </section>
      } @else {
    <app-stat-strip [items]="stats()" />
  
      <div class="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <label class="text-[14px] font-bold text-[#4b5563]">Type:</label>
        <select class="input !w-[170px]" [ngModel]="type()" (ngModelChange)="type.set($event); load()"><option>All Types</option>@for (t of types; track t) { <option>{{ t }}</option> }</select>
        <label class="flex items-center gap-2 text-[14px]"><input type="checkbox" [ngModel]="unreadOnly()" (ngModelChange)="unreadOnly.set($event); load()" /> Unread Only</label>
        <div class="ml-auto flex gap-2"><button class="btn btn-gray" (click)="type.set('All Types'); unreadOnly.set(false); load()">Clear</button><button class="btn btn-brand" (click)="load()">Refresh</button>
          <button class="btn btn-brand" [disabled]="!data()?.unread" (click)="markAll()">Mark All as Read</button></div>
      </div>
  
      <div class="grid items-start gap-5" [class]="sel() ? 'xl:grid-cols-[1fr_380px]' : ''">
        <section class="card p-3">
          <div class="max-h-[560px] space-y-2 overflow-auto">
            @for (n of data()?.items ?? []; track n.id) {
              <button class="flex w-full gap-3 rounded-lg border-l-4 px-4 py-3 text-left transition hover:bg-[#eef8f8]" [class.bg-[#fafafa]]="n.isRead" [class.bg-white]="!n.isRead"
                      [class.ring-1]="sel()?.id === n.id" [class.ring-brand]="sel()?.id === n.id" [style.border-color]="n.isRead ? '#e0e0e0' : color(n.type)" (click)="open(n)">
                <app-icon name="bell" class="h-[36px] w-[36px]"></app-icon>
                <div class="min-w-0 flex-1"><p class="text-[14px] text-brand" [class.font-bold]="!n.isRead">{{ n.title }}</p><p class="line-clamp-2 text-[13px] text-[#4b5563]">{{ n.message }}</p></div>
                <span class="whitespace-nowrap text-[13px] text-[#4b5563]" [title]="n.dateCreated | dt">{{ rel(n.dateCreated) }}</span>
              </button>
            } @empty { <p class="p-8 text-center text-[13px] text-[#4b5563]">No notifications</p> }
          </div>
          <p class="px-3 pt-2 text-[12px] text-[#4b5563]">Showing {{ data()?.items?.length ?? 0 }} {{ data()?.items?.length === 1 ? 'record' : 'records' }}</p>
        </section>
        @if (sel()) { <aside class="card p-5">
          @if (sel(); as n) {
            <h2 class="mb-3 text-[18px] font-bold text-brand">{{ n.title }}</h2>
            <p class="text-[14px] font-bold" [style.color]="color(n.type)">{{ n.type }}</p><p class="mb-3 text-[13px] text-[#4b5563]">{{ n.dateCreated | dt }}</p>
            <p class="mb-4 whitespace-pre-wrap text-[14px]">{{ n.message }}</p>
            <p class="text-[13px] font-bold text-[#4b5563]">Sent by:</p><p class="mb-2 text-[14px]">{{ n.senderName }}</p>
            <p class="text-[13px] font-bold text-[#4b5563]">Delivery Method:</p><p class="mb-2 text-[14px]">In-App</p>
            <p class="text-[13px] font-bold text-[#4b5563]">Status:</p><p class="text-[14px] font-bold" [style.color]="n.isRead ? '#17692c' : '#8a5300'">{{ n.isRead ? 'Read' : 'Unread' }}</p>
          }
        </aside> }
      </div>
      }
    }
  `,
})
export class ScholarNotificationsPage implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  data = signal<ScholarNotifications | null>(null);
  sel = signal<ScholarNotification | null>(null);
  type = signal('All Types'); unreadOnly = signal(false);
  stats = computed<StatItem[]>(() => {
    const d = this.data();
    return [
      { label: 'Total', value: d?.total ?? 0 },
      { label: 'Unread', value: d?.unread ?? 0, tone: 'pending' },
      { label: 'Payment updates', value: d?.payment ?? 0, tone: 'ok' },
      { label: 'Alerts', value: d?.alert ?? 0, tone: 'danger' },
    ];
  });
  filtersActive = () => this.type() !== 'All Types' || this.unreadOnly();
  types = ['Reminder', 'Alert', 'Update', 'Announcement'];
  color = (t: string) => NOTIFICATION_COLORS[t] ?? '#646464'; rel = relativeTime;

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    try { this.data.set(await firstValueFrom(this.api.get<ScholarNotifications>('/scholar/notifications', { type: this.type(), unreadOnly: this.unreadOnly() }))); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  async open(n: ScholarNotification): Promise<void> {
    this.sel.set(n);
    if (!n.isRead) { try { await firstValueFrom(this.api.post(`/scholar/notifications/${n.id}/read`)); this.sel.set({ ...n, isRead: true }); await this.load(); } catch { /* non-critical */ } }
  }

  async markAll(): Promise<void> { try { await firstValueFrom(this.api.post('/scholar/notifications/read-all')); await this.load(); } catch (e) { void this.dlg.error(errorMessage(e)); } }
}
