// =====================================================================
// notifications.ts - Admin > Notifications (/admin/notifications).
// List, read, compose, resend and delete in-app notifications.
// API: /api/admin/notifications (NotificationsController)
// Live: reloads when notifications change.
// =====================================================================
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RealtimeService, reloadOn } from '../../core/realtime';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { ToastService } from '../../core/toast';
import { DateTimePipe, NOTIFICATION_COLORS, relativeTime } from '../../core/format';
import { ComposeResult, NotificationItem, NotificationStats, Option } from '../../core/models';
import { Modal } from '../../shared/modal';
import { AppIcon } from '../../shared/icon';
import { ScrollCue } from '../../shared/scroll-cue';
import { StatStrip } from '../../shared/stat-strip';

@Component({
  selector: 'app-notifications',
  imports: [StatStrip, ScrollCue, AppIcon, FormsModule, DateTimePipe, Modal],
  template: `
    <app-stat-strip [items]="cards()" />

    <div class="card mb-4 flex flex-wrap items-end gap-3 p-4">
      <div>
        <label class="field-label-b">Search</label
        ><input
          class="input !w-[170px]"
          [ngModel]="search()"
          (ngModelChange)="search.set($event); reloadSoon()"
        />
      </div>
      <div>
        <label class="field-label-b">Recipient</label>
        <select
          class="input !w-[180px]"
          [ngModel]="recipientFilter()"
          (ngModelChange)="recipientFilter.set($event); loadList()"
        >
          <option [ngValue]="0">All Recipients</option>
          @for (r of recipients(); track r.id) {
            <option [ngValue]="r.id">{{ r.name }}</option>
          }
        </select>
      </div>
      <div>
        <label class="field-label-b">Type</label>
        <select
          class="input !w-[150px]"
          [ngModel]="typeFilter()"
          (ngModelChange)="typeFilter.set($event); loadList()"
        >
          <option>All Types</option>
          @for (t of types; track t) {
            <option>{{ t }}</option>
          }
        </select>
      </div>
      <label class="flex items-center gap-2 pb-1 text-[13px]"
        ><input
          type="checkbox"
          [ngModel]="unreadOnly()"
          (ngModelChange)="unreadOnly.set($event); loadList()"
        />
        Unread only</label
      >
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <button class="btn btn-ok" (click)="composeOpen.set(true)">
          <app-icon name="bell" class="h-4 w-4"></app-icon>Compose
        </button>
        <button class="btn btn-accent" (click)="refresh()">Refresh</button>
        <button class="btn btn-gray" (click)="clearFilters()">Clear</button>
        <button
          class="btn btn-brand"
          (click)="markAllRead()"
          title="Mark every unread notification as read"
        >
          Mark all read
        </button>
        <span class="mx-2 h-[28px] w-px bg-[#c9c9c9]" aria-hidden="true"></span>
        <button
          class="btn btn-danger-outline"
          (click)="deleteRead()"
          title="Permanently delete every notification that has been read"
        >
          Delete read
        </button>
      </div>
    </div>

    <div class="grid items-start gap-4" [class]="sel() ? 'xl:grid-cols-[1fr_300px]' : ''">
      <section class="card overflow-hidden">
        <div scrollCue class="grid-wrap max-h-[560px]">
          <table class="dgrid">
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Recipient</th>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              @for (n of list(); track n.id; let i = $index) {
                <tr
                  class="cursor-pointer"
                  [class.alt]="i % 2 === 1"
                  [class.sel]="sel()?.id === n.id"
                  [class.font-bold]="!n.isRead"
                  (click)="show(n)"
                >
                  <td>{{ n.id }}</td>
                  <td class="whitespace-nowrap" [title]="n.dateCreated | dt">
                    {{ rel(n.dateCreated) }}
                  </td>
                  <td>{{ n.recipientName }}</td>
                  <td class="wrap">{{ n.title }}</td>
                  <td>
                    <span [style.color]="tcolor(n.type)">{{ n.type }}</span>
                  </td>
                  <td>{{ n.isRead ? 'Read' : 'Unread' }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="!py-8 text-center text-[#595959]">No notifications</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      @if (sel()) {
        <aside class="card p-4">
          <h2 class="mb-3 text-[12pt] font-bold text-accent">Notification Details</h2>
          @if (sel(); as n) {
            <p class="text-[12px]">Date: {{ n.dateCreated | dt }}</p>
            <p class="text-[12px]">Sender: {{ n.senderName }}</p>
            <p class="text-[12px]">Recipient: {{ n.recipientName }}</p>
            <p class="text-[12px]">Type: {{ n.type }}</p>
            <p class="text-[12px]">Delivery Method: In-App</p>
            <p class="mb-2 text-[12px]">Status: {{ n.isRead ? 'Read' : 'Unread' }}</p>
            <p class="mb-1 text-[10pt] font-bold">Message:</p>
            <div
              class="mb-3 max-h-[260px] overflow-auto whitespace-pre-wrap rounded bg-surface p-2 text-[12px]"
            >
              {{ n.message }}
            </div>
            <button class="btn btn-accent mb-2 w-full" (click)="resend(n)">
              Resend Notification
            </button>
            <button class="btn btn-danger w-full" (click)="remove(n)">Delete</button>
          }
        </aside>
      }
    </div>
    @if (composeOpen()) {
      <app-modal title="Compose notification" [width]="620" (closed)="composeOpen.set(false)">
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="field-label-b">Recipient</label>
            <select class="input" [(ngModel)]="c.recipientId">
              <option [ngValue]="0">All Active Scholars</option>
              @for (r of recipients(); track r.id) {
                <option [ngValue]="r.id">{{ r.name }}</option>
              }
            </select>
          </div>
          <div>
            <label class="field-label-b">Notification type</label
            ><select class="input" [(ngModel)]="c.type">
              @for (t of composeTypes; track t) {
                <option>{{ t }}</option>
              }
            </select>
          </div>
        </div>
        <div class="my-4 flex flex-wrap gap-6 text-[13px]">
          <label class="flex items-center gap-2"
            ><input type="checkbox" checked disabled /> Send in-app</label
          >
          <label class="flex items-center gap-2"
            ><input type="checkbox" [(ngModel)]="c.sendEmail" /> Send email</label
          >
        </div>
        <label class="field-label-b">Title</label
        ><input class="input mb-4" [(ngModel)]="c.title" maxlength="200" />
        <label class="field-label-b">Message</label
        ><textarea class="input mb-5" rows="8" [(ngModel)]="c.message" maxlength="4000"></textarea>
        <div class="flex flex-wrap justify-between gap-2">
          <button class="btn btn-gray" (click)="clearCompose()">Clear form</button>
          <div class="flex gap-2">
            <button class="btn btn-gray" (click)="composeOpen.set(false)">Cancel</button>
            <button class="btn btn-ok" [disabled]="busy()" (click)="send()">
              <app-icon name="bell" class="h-4 w-4"></app-icon>Send notification
            </button>
          </div>
        </div>
      </app-modal>
    }
  `,
})
export class NotificationsPage implements OnInit, OnDestroy {
  private api = inject(Api);
  private dlg = inject(DialogService);
  private toast = inject(ToastService);
  // Reload when notifications change on the server.
  constructor() {
    const rt = inject(RealtimeService);
    reloadOn([rt.notificationsChanged$], () => this.refresh());
  }
  stats = signal<NotificationStats | null>(null);
  list = signal<NotificationItem[]>([]);
  recipients = signal<Option[]>([]);
  sel = signal<NotificationItem | null>(null);
  busy = signal(false);
  composeOpen = signal(false);
  search = signal('');
  recipientFilter = signal(0);
  typeFilter = signal('All Types');
  unreadOnly = signal(false);
  types = ['Reminder', 'Alert', 'Update', 'Announcement'];
  composeTypes = this.types;
  // The compose form values.
  c = { recipientId: 0, type: 'Update', title: '', message: '', sendEmail: false };
  tcolor = (t: string) => NOTIFICATION_COLORS[t] ?? '#646464';
  rel = relativeTime;
  private timer: ReturnType<typeof setTimeout> | undefined;

  cards = computed(() => {
    const s = this.stats();
    return [
      {
        label: 'Total Sent',
        value: s?.total ?? 0,
        icon: 'bell',
        color: '#0a5c5c',
        hint: 'All in-app notifications sent (not affected by the filters below)',
      },
      {
        label: 'Unread',
        value: s?.unread ?? 0,
        icon: 'wall-clock',
        color: '#8a5300',
        tone: 'pending' as const,
        hint: 'In-app notifications scholars have not opened yet',
      },
      {
        label: 'Read',
        value: s?.read ?? 0,
        icon: 'checked',
        color: '#17692c',
        hint: 'In-app notifications scholars have opened',
      },
    ];
  });

  async ngOnInit(): Promise<void> {
    this.recipients.set(
      await firstValueFrom(this.api.get<Option[]>('/admin/notifications/recipients')),
    );
    await this.refresh();
  }

  // Reload the list and the numbers together.
  async refresh(): Promise<void> {
    await Promise.all([this.loadList(), this.loadStats()]);
  }
  async loadStats(): Promise<void> {
    this.stats.set(
      await firstValueFrom(this.api.get<NotificationStats>('/admin/notifications/stats')),
    );
  }
  reloadSoon(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.loadList(), 300);
  }

  // Load notifications with the current filters.
  async loadList(): Promise<void> {
    try {
      this.list.set(
        await firstValueFrom(
          this.api.get<NotificationItem[]>('/admin/notifications', {
            type: this.typeFilter(),
            unreadOnly: this.unreadOnly(),
            search: this.search(),
            recipientId: this.recipientFilter() || null,
          }),
        ),
      );
    } catch (e) {
      void this.dlg.error(errorMessage(e));
    }
  }

  clearFilters(): void {
    this.search.set('');
    this.recipientFilter.set(0);
    this.typeFilter.set('All Types');
    this.unreadOnly.set(false);
    void this.loadList();
  }
  clearCompose(): void {
    this.c = { recipientId: 0, type: 'Update', title: '', message: '', sendEmail: false };
  }

  // Open one notification (and mark it read).
  async show(n: NotificationItem): Promise<void> {
    this.sel.set(n);
    if (!n.isRead) {
      try {
        await firstValueFrom(this.api.post(`/admin/notifications/${n.id}/read`));
      } catch {
        /* non-critical */
      }
      await Promise.all([this.loadList(), this.loadStats()]);
    }
  }

  // Send the compose form. No recipient = all active scholars.
  async send(): Promise<void> {
    if (!this.c.title.trim() || !this.c.message.trim()) {
      void this.dlg.warning('Please fill in title and message.');
      return;
    }
    this.busy.set(true);
    try {
      const r = await firstValueFrom(
        this.api.post<ComposeResult>('/admin/notifications', {
          recipientId: this.c.recipientId || null,
          type: this.c.type,
          title: this.c.title.trim(),
          message: this.c.message.trim(),
          sendEmail: this.c.sendEmail,
        }),
      );
      void this.dlg.success(
        `Notification sent successfully!\n\nRecipients: ${r.created}${this.c.sendEmail ? `\nEmails sent: ${r.emailsSent}` : ''}`,
      );
      this.clearCompose();
      this.composeOpen.set(false);
      await Promise.all([this.loadList(), this.loadStats()]);
    } catch (e) {
      void this.dlg.error(errorMessage(e), 'Error sending notification');
    } finally {
      this.busy.set(false);
    }
  }

  // Copy an old notification into the compose form.
  resend(n: NotificationItem): void {
    this.c.title = n.title;
    this.c.message = n.message;
    this.c.type = n.type;
    this.c.recipientId = 0;
    this.composeOpen.set(true);
  }

  // Deletes are applied after a short grace period so they can be undone (the API delete is permanent).
  private pending: { timer: ReturnType<typeof setTimeout>; commit: () => Promise<void> } | null =
    null;
  private async flush(): Promise<void> {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);
    await p.commit();
  }
  // How "Undo" works: hide the row now, wait 8 seconds, then really delete.
  // Clicking "Undo" in the toast cancels the timer and puts the row back.
  private deferDelete(
    message: string,
    hide: () => () => void,
    commit: () => Promise<unknown>,
  ): void {
    void this.flush();
    const restore = hide();
    const timer = setTimeout(() => void this.flush(), 8000);
    this.pending = {
      timer,
      commit: async () => {
        try {
          await commit();
        } catch (e) {
          restore();
          void this.dlg.error(errorMessage(e));
        }
        await this.refresh();
      },
    };
    this.toast.show(message, {
      actionLabel: 'Undo',
      durationMs: 8000,
      onAction: () => {
        clearTimeout(timer);
        this.pending = null;
        restore();
      },
    });
  }
  ngOnDestroy(): void {
    void this.flush();
  }

  // Delete one notification (with Undo).
  remove(n: NotificationItem): void {
    const before = this.list();
    const wasSel = this.sel();
    this.deferDelete(
      `Notification “${n.title}” deleted.`,
      () => {
        this.list.set(before.filter((x) => x.id !== n.id));
        this.sel.set(null);
        return () => {
          this.list.set(before);
          this.sel.set(wasSel);
        };
      },
      () => firstValueFrom(this.api.delete(`/admin/notifications/${n.id}`)),
    );
  }
  // Delete all read notifications (with Undo).
  async deleteRead(): Promise<void> {
    const count = this.stats()?.read ?? 0;
    if (!count) {
      void this.dlg.info('There are no read notifications to delete.');
      return;
    }
    if (
      !(await this.dlg.confirm(
        `Permanently delete ${count} read notification${count === 1 ? '' : 's'}?\n\nYou can undo for a few seconds afterwards.`,
        'Delete read notifications',
        `Delete ${count}`,
        'Keep them',
        true,
      ))
    )
      return;
    const before = this.list();
    this.deferDelete(
      `${count} read notification${count === 1 ? '' : 's'} deleted.`,
      () => {
        this.list.set(before.filter((x) => !x.isRead));
        return () => this.list.set(before);
      },
      () => firstValueFrom(this.api.delete<{ deleted: number }>('/admin/notifications/read')),
    );
  }
  // Mark every notification as read.
  async markAllRead(): Promise<void> {
    const n = this.stats()?.unread ?? 0;
    if (!n) {
      void this.dlg.info('Everything is already marked as read.');
      return;
    }
    if (
      !(await this.dlg.confirm(
        `Mark ${n} unread notification${n === 1 ? '' : 's'} as read for all scholars?\n\nThis can't be reversed.`,
        'Mark all as read',
        'Mark as read',
        'Cancel',
      ))
    )
      return;
    try {
      await firstValueFrom(this.api.post('/admin/notifications/read-all'));
      await this.refresh();
      this.toast.show(`${n} notification${n === 1 ? '' : 's'} marked as read.`);
    } catch (e) {
      void this.dlg.error(errorMessage(e));
    }
  }
}
