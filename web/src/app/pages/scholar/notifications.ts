import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DateTimePipe, NOTIFICATION_COLORS, relativeTime } from '../../core/format';
import { ScholarNotification, ScholarNotifications } from '../../core/models';

@Component({
  selector: 'app-scholar-notifications',
  imports: [FormsModule, DateTimePipe],
  template: `
    <div class="mb-5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5">
      <div class="card flex h-[110px] items-center gap-4 px-5"><img src="assets/bell.png" alt="" class="h-[45px] w-[45px] object-contain" /><div><p class="text-[12pt] font-bold text-label">Total Notifications</p><p class="text-[30px] font-bold text-brand">{{ data()?.total ?? 0 }}</p></div></div>
      <div class="card flex h-[110px] items-center gap-4 px-5"><img src="assets/wall-clock.png" alt="" class="h-[45px] w-[45px] object-contain" /><div><p class="text-[12pt] font-bold text-label">Unread Count</p><p class="text-[30px] font-bold text-warn">{{ data()?.unread ?? 0 }}</p></div></div>
      <div class="card flex h-[110px] items-center gap-4 px-5"><img src="assets/dollar.png" alt="" class="h-[45px] w-[45px] object-contain" /><div><p class="text-[12pt] font-bold text-label">Payment Notifications</p><p class="text-[30px] font-bold text-ok">{{ data()?.payment ?? 0 }}</p></div></div>
      <div class="card flex h-[110px] items-center gap-4 px-5"><img src="assets/reject.png" alt="" class="h-[45px] w-[45px] object-contain" /><div><p class="text-[12pt] font-bold text-label">Alert Notifications</p><p class="text-[30px] font-bold text-danger">{{ data()?.alert ?? 0 }}</p></div></div>
    </div>

    <div class="card mb-4 flex flex-wrap items-center gap-3 p-4">
      <label class="text-[11pt] font-bold text-label">Type:</label>
      <select class="input !w-[170px]" [ngModel]="type()" (ngModelChange)="type.set($event); load()"><option>All Types</option>@for (t of types; track t) { <option>{{ t }}</option> }</select>
      <label class="flex items-center gap-2 text-[11pt]"><input type="checkbox" [ngModel]="unreadOnly()" (ngModelChange)="unreadOnly.set($event); load()" /> Unread Only</label>
      <div class="ml-auto flex gap-2"><button class="btn btn-gray" (click)="type.set('All Types'); unreadOnly.set(false); load()">Clear</button><button class="btn btn-brand" (click)="load()">Refresh</button>
        <button class="btn btn-brand" [disabled]="!data()?.unread" (click)="markAll()">Mark All as Read</button></div>
    </div>

    <div class="grid gap-5 xl:grid-cols-[1fr_380px]">
      <section class="card p-3">
        <div class="max-h-[560px] space-y-2 overflow-auto">
          @for (n of data()?.items ?? []; track n.id) {
            <button class="flex w-full gap-3 rounded-lg border-l-4 px-4 py-3 text-left transition hover:bg-[#eef8f8]" [class.bg-[#fafafa]]="n.isRead" [class.bg-white]="!n.isRead"
                    [class.ring-1]="sel()?.id === n.id" [class.ring-brand]="sel()?.id === n.id" [style.border-color]="n.isRead ? '#e0e0e0' : color(n.type)" (click)="open(n)">
              <img src="assets/bell.png" alt="" class="h-[36px] w-[36px] object-contain" />
              <div class="min-w-0 flex-1"><p class="text-[11pt] text-brand" [class.font-bold]="!n.isRead">{{ n.title }}</p><p class="line-clamp-2 text-[10pt] text-[#555]">{{ n.message }}</p></div>
              <span class="whitespace-nowrap text-[9pt] text-[#969696]">{{ rel(n.dateCreated) }}</span>
            </button>
          } @empty { <p class="p-8 text-center text-[13px] text-[#969696]">No notifications</p> }
        </div>
        <p class="px-3 pt-2 text-[9pt] text-muted">Showing {{ data()?.items?.length ?? 0 }} records</p>
      </section>
      <aside class="card p-5">
        @if (sel(); as n) {
          <h2 class="mb-1 text-[16pt] font-bold text-brand">{{ n.title }}</h2>
          <p class="text-[11pt] font-bold" [style.color]="color(n.type)">{{ n.type }}</p><p class="mb-3 text-[10pt] text-muted">{{ n.dateCreated | dt }}</p>
          <p class="mb-4 whitespace-pre-wrap text-[11pt]">{{ n.message }}</p>
          <p class="text-[10pt] font-bold text-label">Sent by:</p><p class="mb-2 text-[11pt]">{{ n.senderName }}</p>
          <p class="text-[10pt] font-bold text-label">Delivery Method:</p><p class="mb-2 text-[11pt]">In-App</p>
          <p class="text-[10pt] font-bold text-label">Status:</p><p class="text-[11pt] font-bold" [style.color]="n.isRead ? '#28a745' : '#ffaa00'">{{ n.isRead ? 'Read' : 'Unread' }}</p>
        } @else { <h2 class="mb-2 text-[16pt] font-bold text-brand">Select a notification</h2><p class="text-[11pt]">Click on any notification to view its details.</p> }
      </aside>
    </div>
  `,
})
export class ScholarNotificationsPage implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  data = signal<ScholarNotifications | null>(null);
  sel = signal<ScholarNotification | null>(null);
  type = signal('All Types'); unreadOnly = signal(false);
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
