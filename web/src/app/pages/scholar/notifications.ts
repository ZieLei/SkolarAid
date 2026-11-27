// =====================================================================
// notifications.ts - Notifications (/scholar/notifications).
// The scholar's inbox. Opening a message marks it as read.
// API: /api/scholar/notifications (list, mark read, mark all read).
// Live: reloads when a new notification arrives.
// =====================================================================
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RealtimeService, reloadOn } from '../../core/realtime';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DateTimePipe, NOTIFICATION_COLORS, relativeTime, notificationIcon, tint } from '../../core/format';
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
          <h2 class="mb-2 text-[20px] font-semibold tracking-tight text-ink">You're all caught up</h2>
          <p class="text-[14px] text-[#4b5563]">Nothing here yet. When the Scholarship Office sends you a reminder, a payment update or an announcement, it will show up on this page.</p>
        </section>
      } @else {
    <app-stat-strip [items]="stats()" />

      <!-- Filter chips: one tap to switch type; "Unread only" next to them -->
      <div class="card flex flex-wrap items-center gap-2 p-3 sm:p-4" role="group" aria-label="Filter notifications">
        <div class="flex flex-wrap gap-1.5 rounded-full bg-[#eef3f4] p-1">
          @for (t of chips; track t) {
            <button class="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition" [attr.aria-pressed]="type() === t"
                    [class]="type() === t ? 'bg-white text-brand shadow-sm ring-1 ring-black/5' : 'text-muted hover:text-ink'"
                    (click)="type.set(t); load()">{{ t === 'All Types' ? 'All' : t }}</button>
          }
        </div>
        <label class="ml-1 flex cursor-pointer items-center gap-2 text-[13px] font-medium text-label"><input type="checkbox" class="h-4 w-4 accent-[#00444f]" [ngModel]="unreadOnly()" (ngModelChange)="unreadOnly.set($event); load()" /> Unread only</label>
        <button class="btn btn-brand sm:ml-auto" [disabled]="!data()?.unread" (click)="markAll()">Mark all as read</button>
      </div>

      <div class="grid items-start gap-5" [class]="sel() ? 'xl:grid-cols-[1fr_400px]' : ''">
        <section class="card overflow-hidden">
          <div class="max-h-[620px] divide-y divide-line overflow-auto">
            @for (n of data()?.items ?? []; track n.id) {
              <button class="group relative flex w-full gap-4 px-5 py-4 text-left transition-colors hover:bg-[#f4f9fa]" [class.bg-brand-soft]="sel()?.id === n.id" [class.bg-[#fbfdfd]]="n.isRead && sel()?.id !== n.id" (click)="open(n)">
                @if (!n.isRead) { <span class="absolute inset-y-3 left-0 w-[3px] rounded-r-full" [style.background]="color(n.type)" aria-hidden="true"></span> }
                <span class="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-2xl" [style.background]="tint(color(n.type))" [style.color]="color(n.type)" [class.opacity-60]="n.isRead"><app-icon [name]="icon(n.type, n.title)" class="h-[22px] w-[22px]"></app-icon></span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="rounded-full px-2 py-[1px] text-[11px] font-semibold" [style.background]="tint(color(n.type))" [style.color]="color(n.type)">{{ n.type }}</span>
                    @if (!n.isRead) { <span class="rounded-full bg-[#0b5cad] px-2 py-[1px] text-[10px] font-bold uppercase tracking-wider text-white">New</span> }
                    <span class="ml-auto shrink-0 whitespace-nowrap text-[12px] text-muted" [title]="n.dateCreated | dt">{{ rel(n.dateCreated) }}</span>
                  </div>
                  <p class="mt-1.5 text-[15px] leading-snug text-ink" [class.font-semibold]="!n.isRead" [class.font-medium]="n.isRead">{{ n.title }}</p>
                  <p class="mt-0.5 line-clamp-2 whitespace-pre-line text-[13px] leading-relaxed text-muted">{{ n.message }}</p>
                </div>
              </button>
            } @empty { <p class="p-10 text-center text-[13px] text-muted">No notifications match these filters.</p> }
          </div>
          <p class="border-t border-line bg-[#fafcfc] px-5 py-2.5 text-[12px] text-muted">Showing {{ data()?.items?.length ?? 0 }} {{ data()?.items?.length === 1 ? 'notification' : 'notifications' }}</p>
        </section>
        @if (sel()) {
        <!-- On phones the details slide up from the bottom (tap the dark area to close); on wide screens they sit beside the list. -->
        <div class="fixed inset-0 z-40 bg-[#06242a]/50 backdrop-blur-sm xl:hidden" (click)="sel.set(null)" aria-hidden="true"></div>
        <aside class="card fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-b-none p-0 shadow-2xl xl:sticky xl:top-[88px] xl:z-auto xl:max-h-none xl:rounded-b-2xl xl:shadow-sm" role="dialog" aria-modal="true" (keydown.escape)="sel.set(null)">
          @if (sel(); as n) {
            <div class="flex items-start gap-3 border-b border-line p-5" [style.background]="tint(color(n.type))">
              <span class="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm" [style.color]="color(n.type)"><app-icon [name]="icon(n.type, n.title)" class="h-6 w-6"></app-icon></span>
              <div class="min-w-0 flex-1">
                <p class="text-[12px] font-semibold uppercase tracking-wider" [style.color]="color(n.type)">{{ n.type }}</p>
                <h2 class="text-[18px] font-semibold leading-snug tracking-tight text-ink">{{ n.title }}</h2>
              </div>
              <button class="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full text-[22px] leading-none text-muted hover:bg-white/70 hover:text-black" aria-label="Close notification" (click)="sel.set(null)">×</button>
            </div>
            <div class="p-5">
              <p class="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{{ n.message }}</p>
              <dl class="mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 rounded-xl bg-[#f4f7f8] p-4 text-[13px]">
                <dt class="text-muted">Received</dt><dd class="font-medium">{{ n.dateCreated | dt }}</dd>
                <dt class="text-muted">Sent by</dt><dd class="font-medium">{{ n.senderName }}</dd>
                <dt class="text-muted">Delivery</dt><dd class="font-medium">In-App</dd>
                <dt class="text-muted">Status</dt><dd class="font-semibold" [style.color]="n.isRead ? '#17692c' : '#8a5300'">{{ n.isRead ? 'Read' : 'Unread' }}</dd>
              </dl>
            </div>
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
  // Number cards at the top.
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
  chips = ['All Types', ...this.types];
  icon = notificationIcon; tint = tint;
  color = (t: string) => NOTIFICATION_COLORS[t] ?? '#646464'; rel = relativeTime;

  constructor() {
    const rt = inject(RealtimeService);
    reloadOn([rt.notificationReceived$], () => this.load());
  }

  ngOnInit(): void { void this.load(); }

  // Load the inbox using the type / unread filters (filtered on the server).
  async load(): Promise<void> {
    try { this.data.set(await firstValueFrom(this.api.get<ScholarNotifications>('/scholar/notifications', { type: this.type(), unreadOnly: this.unreadOnly() }))); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  // Open one message and mark it as read.
  async open(n: ScholarNotification): Promise<void> {
    this.sel.set(n);
    if (!n.isRead) { try { await firstValueFrom(this.api.post(`/scholar/notifications/${n.id}/read`)); this.sel.set({ ...n, isRead: true }); await this.load(); } catch { /* non-critical */ } }
  }

  // Mark every message as read.
  async markAll(): Promise<void> {
    const n = this.data()?.unread ?? 0;
    if (!n) { void this.dlg.info('Everything is already marked as read.'); return; }
    try { await firstValueFrom(this.api.post('/scholar/notifications/read-all')); await this.load(); void this.dlg.success(`${n} notification${n === 1 ? '' : 's'} marked as read.`); }
    catch (e) { void this.dlg.error(errorMessage(e)); }
  }
}
