import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, DateTimePipe, NOTIFICATION_COLORS, PesoPipe, relativeTime, statusColor } from '../../core/format';
import { ComposeResult, NotificationItem, NotificationStats, Option, RegistrationApproved, RegistrationDetail, RegistrationListItem } from '../../core/models';
import { Modal } from '../../shared/modal';

@Component({
  selector: 'app-notifications',
  imports: [FormsModule, DateTimePipe, DatePipeShort, PesoPipe, Modal],
  template: `
    <div class="mb-4 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
      @for (c of cards(); track c.label) {
        <div class="card flex h-[110px] items-center gap-4 px-4" [title]="c.hint">
          <img [src]="'assets/' + c.icon" alt="" class="card-icon h-[48px] w-[45px] object-contain" />
          <div><p class="text-[11pt] font-bold">{{ c.label }}</p><p class="text-[30px] font-bold" [style.color]="c.color">{{ c.value }}</p></div>
        </div>
      }
    </div>

    <div class="mb-4 flex gap-1 border-b-2 border-[#d9d9d9]">
      @for (t of tabs; track t.id) {
        <button class="rounded-t-lg px-5 py-2 text-[14px] font-bold" [class.bg-accent]="tab() === t.id" [class.text-white]="tab() === t.id" [class.text-label]="tab() !== t.id" (click)="tab.set(t.id)">
          {{ t.label }}@if (t.id === 'reg' && (stats()?.pendingRegistrations ?? 0) > 0) { <span class="ml-2 rounded-full bg-danger px-2 text-[11px] text-white">{{ stats()?.pendingRegistrations }}</span> }
        </button>
      }
    </div>

    @if (tab() === 'notifs') {
      <div class="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div><label class="field-label-b">Search</label><input class="input !w-[170px]" [ngModel]="search()" (ngModelChange)="search.set($event); reloadSoon()" /></div>
        <div><label class="field-label-b">Recipient</label>
          <select class="input !w-[180px]" [ngModel]="recipientFilter()" (ngModelChange)="recipientFilter.set($event); loadList()"><option [ngValue]="0">All Recipients</option>@for (r of recipients(); track r.id) { <option [ngValue]="r.id">{{ r.name }}</option> }</select></div>
        <div><label class="field-label-b">Type</label>
          <select class="input !w-[150px]" [ngModel]="typeFilter()" (ngModelChange)="typeFilter.set($event); loadList()"><option>All Types</option>@for (t of types; track t) { <option>{{ t }}</option> }</select></div>
        <div><label class="field-label-b">Method</label><select class="input !w-[130px]" disabled><option>In-App</option></select></div>
        <label class="flex items-center gap-2 pb-1 text-[13px]"><input type="checkbox" [ngModel]="unreadOnly()" (ngModelChange)="unreadOnly.set($event); loadList()" /> Unread only</label>
        <div class="ml-auto flex gap-2">
          <button class="btn btn-accent" (click)="refresh()">Refresh</button>
          <button class="btn btn-gray" (click)="clearFilters()">Clear</button>
          <button class="btn btn-brand" (click)="markAllRead()">Mark All Read</button>
          <button class="btn btn-danger" (click)="deleteRead()">Delete All Read</button>
        </div>
      </div>

      <div class="grid gap-4 xl:grid-cols-[580px_1fr_263px]">
        <section class="card p-5">
          <h2 class="mb-3 text-[14pt] font-bold text-accent">Compose Notification</h2>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label-b">Recipient</label>
              <select class="input" [(ngModel)]="c.recipientId"><option [ngValue]="0">All Active Scholars</option>@for (r of recipients(); track r.id) { <option [ngValue]="r.id">{{ r.name }}</option> }</select></div>
            <div><label class="field-label-b">Notification Type</label><select class="input" [(ngModel)]="c.type">@for (t of composeTypes; track t) { <option>{{ t }}</option> }</select></div>
          </div>
          <div class="my-3 flex gap-6 text-[13px]">
            <label class="flex items-center gap-2"><input type="checkbox" checked disabled /> Send In-App</label>
            <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="c.sendEmail" /> Send In email</label>
            <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="c.sendSms" /> Send SMS</label>
          </div>
          <label class="field-label-b">Notification Title</label><input class="input mb-3" [(ngModel)]="c.title" maxlength="200" />
          <label class="field-label-b">Message</label><textarea class="input mb-4" rows="8" [(ngModel)]="c.message" maxlength="4000"></textarea>
          <div class="flex justify-between">
            <button class="btn !h-[50px] w-[120px]" style="background:gray" (click)="clearCompose()">Clear Form</button>
            <button class="btn btn-ok !h-[50px] w-[200px] !text-[14px]" [disabled]="busy()" (click)="send()"><img src="assets/bell.png" alt="" class="h-5 w-5" />Send Notification</button>
          </div>
        </section>

        <section class="card overflow-hidden">
          <div class="grid-wrap max-h-[560px]">
            <table class="dgrid">
              <thead><tr><th>ID</th><th>Date</th><th>Recipient</th><th>Title</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>
                @for (n of list(); track n.id; let i = $index) {
                  <tr class="cursor-pointer" [class.alt]="i % 2 === 1" [class.sel]="sel()?.id === n.id" [class.font-bold]="!n.isRead" (click)="show(n)">
                    <td>{{ n.id }}</td><td class="whitespace-nowrap">{{ rel(n.dateCreated) }}</td><td>{{ n.recipientName }}</td><td class="max-w-[160px] truncate" [title]="n.title">{{ n.title }}</td>
                    <td><span [style.color]="tcolor(n.type)">{{ n.type }}</span></td><td>{{ n.isRead ? 'Read' : 'Unread' }}</td>
                  </tr>
                } @empty { <tr><td colspan="6" class="!py-8 text-center text-[#969696]">No notifications</td></tr> }
              </tbody>
            </table>
          </div>
        </section>

        <aside class="card p-4">
          <h2 class="mb-3 text-[12pt] font-bold text-accent">Notification Details</h2>
          @if (sel(); as n) {
            <p class="text-[12px]">Date: {{ n.dateCreated | dt }}</p><p class="text-[12px]">Sender: {{ n.senderName }}</p><p class="text-[12px]">Recipient: {{ n.recipientName }}</p>
            <p class="text-[12px]">Type: {{ n.type }}</p><p class="text-[12px]">Delivery Method: In-App</p><p class="mb-2 text-[12px]">Status: {{ n.isRead ? 'Read' : 'Unread' }}</p>
            <p class="mb-1 text-[10pt] font-bold">Message:</p>
            <div class="mb-3 max-h-[260px] overflow-auto whitespace-pre-wrap rounded bg-surface p-2 text-[12px]">{{ n.message }}</div>
            <button class="btn btn-accent mb-2 w-full" (click)="resend(n)">Resend Notification</button>
            <button class="btn btn-danger w-full" (click)="remove(n)">Delete</button>
          } @else { <p class="text-[12px] text-muted">Select a notification to see its details.</p> }
        </aside>
      </div>
    } @else {
      <div class="grid gap-4 xl:grid-cols-[480px_1fr]">
        <section class="card max-h-[640px] overflow-auto p-3">
          @for (r of regs(); track r.id) {
            <button class="mb-2 w-full rounded-lg border p-3 text-left transition hover:bg-[#f0f7f8]" [class.border-accent]="regSel()?.id === r.id" [class.border-[#e6e6e6]]="regSel()?.id !== r.id" (click)="openReg(r.id)">
              <div class="flex items-center"><b class="text-[14px] text-brand">{{ r.fullName }}</b><span class="ml-auto text-[12px] font-bold" [style.color]="color(r.status)">{{ r.status }}</span></div>
              <p class="text-[12px] text-muted">{{ r.email }} · {{ r.contactNumber }}</p>
              <p class="truncate text-[12px]">{{ r.course }} — {{ r.yearLevel }}</p><p class="text-[11px] text-[#969696]">Submitted {{ rel(r.createdAt) }}</p>
            </button>
          } @empty { <p class="p-6 text-center text-[13px] text-[#969696]">No registrations</p> }
        </section>

        <section class="card p-5">
          @if (regSel(); as r) {
            <div class="mb-3 flex items-center"><h2 class="text-[14pt] font-bold text-accent">{{ r.firstName }} {{ r.middleName }} {{ r.lastName }}</h2>
              <span class="ml-3 text-[13px] font-bold" [style.color]="color(r.status)">{{ r.status }}</span></div>
            <dl class="grid grid-cols-[160px_1fr] gap-y-1 text-[13px]">
              <dt class="text-muted">Student ID</dt><dd>{{ r.studentId || '(will be generated)' }}</dd>
              <dt class="text-muted">Email</dt><dd>{{ r.email }}</dd><dt class="text-muted">Contact</dt><dd>{{ r.contactNumber }}</dd>
              <dt class="text-muted">Date of Birth</dt><dd>{{ r.dateOfBirth | dmy }}</dd><dt class="text-muted">Gender</dt><dd>{{ r.gender }}</dd>
              <dt class="text-muted">Address</dt><dd>{{ r.address }}</dd><dt class="text-muted">Program / HEI</dt><dd>{{ r.program }} · {{ r.hei }}</dd>
              <dt class="text-muted">Degree Program</dt><dd>{{ r.degreeProgram }}</dd><dt class="text-muted">Year Level</dt><dd>{{ r.yearLevel }}</dd>
              <dt class="text-muted">Scholarship</dt><dd>{{ r.scholarshipName }} — {{ r.stipendAmount | peso }} / {{ r.stipendFrequency }}</dd>
              <dt class="text-muted">Fund Source</dt><dd>{{ r.scholarshipFundSource }}</dd><dt class="text-muted">Renewal</dt><dd>{{ r.renewalConditions }}</dd>
              <dt class="text-muted">Enrollment / Graduation</dt><dd>{{ r.enrollmentDate | dmy }} → {{ r.expectedGraduation | dmy }}</dd>
              <dt class="text-muted">Bank</dt><dd>{{ r.bankName }} {{ r.bankAccountNumber }}</dd><dt class="text-muted">Notes</dt><dd>{{ r.notes }}</dd>
              @if (r.rejectionReason) { <dt class="text-muted">Rejection reason</dt><dd class="text-danger">{{ r.rejectionReason }}</dd> }
            </dl>
            <h3 class="section-title mt-4">Attached Documents</h3>
            <div class="mb-4 flex flex-wrap gap-2">
              @for (k of r.files; track k) { <button class="btn btn-brand" (click)="openFile(r.id, k)">📎 {{ fileLabel(k) }}</button> } @empty { <span class="text-[13px] text-muted">No files</span> }
            </div>
            @if (r.status === 'Pending') {
              <div class="flex gap-3"><button class="btn btn-ok !h-[40px]" [disabled]="busy()" (click)="approve(r)">✓ Approve</button><button class="btn btn-danger !h-[40px]" [disabled]="busy()" (click)="rejectOpen.set(true)">✗ Reject</button></div>
            }
          } @else { <p class="text-[13px] text-muted">Select a registration to view details</p> }
        </section>
      </div>
    }

    @if (rejectOpen()) {
      <app-modal title="Rejection Reason" [width]="520" (closed)="rejectOpen.set(false)">
        <p class="mb-2 text-[13px]">Please provide a reason for rejection. This will be sent to the applicant via email:</p>
        <p class="mb-2 text-[13px] font-bold text-brand">{{ regSel()?.email }}</p>
        <textarea class="input mb-3" rows="5" [(ngModel)]="rejectReason" maxlength="1000"></textarea>
        <label class="mb-4 flex items-center gap-2 text-[13px]"><input type="checkbox" [(ngModel)]="rejectEmail" /> Send rejection email to applicant</label>
        <button class="btn btn-danger ml-auto" (click)="reject()">Submit Rejection</button>
      </app-modal>
    }
  `,
})
export class NotificationsPage implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  tabs = [{ id: 'notifs', label: 'Notifications' }, { id: 'reg', label: 'Registrations' }] as const;
  tab = signal<'notifs' | 'reg'>('notifs');
  stats = signal<NotificationStats | null>(null);
  list = signal<NotificationItem[]>([]);
  recipients = signal<Option[]>([]);
  regs = signal<RegistrationListItem[]>([]);
  regSel = signal<RegistrationDetail | null>(null);
  sel = signal<NotificationItem | null>(null);
  busy = signal(false);
  rejectOpen = signal(false);
  rejectReason = ''; rejectEmail = true;
  search = signal(''); recipientFilter = signal(0); typeFilter = signal('All Types'); unreadOnly = signal(false);
  types = ['Reminder', 'Alert', 'Update', 'Announcement']; composeTypes = this.types;
  c = { recipientId: 0, type: 'Update', title: '', message: '', sendEmail: false, sendSms: false };
  color = statusColor; tcolor = (t: string) => NOTIFICATION_COLORS[t] ?? '#646464'; rel = relativeTime;
  private timer: ReturnType<typeof setTimeout> | undefined;

  cards = computed(() => {
    const s = this.stats();
    return [
      { label: 'Total Sent', value: s?.total ?? 0, icon: 'bell.png', color: '#0a5c5c', hint: 'All notifications sent' },
      { label: 'Pending SMS', value: s?.unread ?? 0, icon: 'wall-clock.png', color: '#ffaa00', hint: 'Notifications not yet read' },
      { label: 'Delivered', value: s?.read ?? 0, icon: 'checked.png', color: '#28a745', hint: 'Notifications read by scholars' },
      { label: 'Failed SMS', value: s?.pendingRegistrations ?? 0, icon: 'reject.png', color: '#fb2c36', hint: 'Registrations awaiting review' },
    ];
  });

  async ngOnInit(): Promise<void> {
    this.recipients.set(await firstValueFrom(this.api.get<Option[]>('/admin/notifications/recipients')));
    await this.refresh();
  }

  async refresh(): Promise<void> { await Promise.all([this.loadList(), this.loadStats(), this.loadRegs()]); }
  async loadStats(): Promise<void> { this.stats.set(await firstValueFrom(this.api.get<NotificationStats>('/admin/notifications/stats'))); }
  async loadRegs(): Promise<void> { this.regs.set(await firstValueFrom(this.api.get<RegistrationListItem[]>('/admin/registrations'))); }
  reloadSoon(): void { clearTimeout(this.timer); this.timer = setTimeout(() => void this.loadList(), 300); }

  async loadList(): Promise<void> {
    try { this.list.set(await firstValueFrom(this.api.get<NotificationItem[]>('/admin/notifications', { type: this.typeFilter(), unreadOnly: this.unreadOnly(), search: this.search(), recipientId: this.recipientFilter() || null }))); }
    catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  clearFilters(): void { this.search.set(''); this.recipientFilter.set(0); this.typeFilter.set('All Types'); this.unreadOnly.set(false); void this.loadList(); }
  clearCompose(): void { this.c = { recipientId: 0, type: 'Update', title: '', message: '', sendEmail: false, sendSms: false }; }

  async show(n: NotificationItem): Promise<void> {
    this.sel.set(n);
    if (!n.isRead) { try { await firstValueFrom(this.api.post(`/admin/notifications/${n.id}/read`)); } catch { /* non-critical */ } await Promise.all([this.loadList(), this.loadStats()]); }
  }

  async send(): Promise<void> {
    if (!this.c.title.trim() || !this.c.message.trim()) { void this.dlg.warning('Please fill in title and message.'); return; }
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.post<ComposeResult>('/admin/notifications', { recipientId: this.c.recipientId || null, type: this.c.type, title: this.c.title.trim(), message: this.c.message.trim(), sendEmail: this.c.sendEmail, sendSms: this.c.sendSms }));
      void this.dlg.success(`Notification sent successfully!\n\nRecipients: ${r.created}${this.c.sendEmail ? `\nEmails sent: ${r.emailsSent}` : ''}${this.c.sendSms ? `\nSMS sent: ${r.smsSent}` : ''}`);
      this.clearCompose(); await Promise.all([this.loadList(), this.loadStats()]);
    } catch (e) { void this.dlg.error(errorMessage(e), 'Error sending notification'); } finally { this.busy.set(false); }
  }

  resend(n: NotificationItem): void { this.c.title = n.title; this.c.message = n.message; this.c.type = n.type; this.c.recipientId = 0; void this.dlg.info('The notification was copied into the compose form. Choose a recipient and send.'); }

  async remove(n: NotificationItem): Promise<void> {
    if (!(await this.dlg.confirm('Delete this notification?'))) return;
    await firstValueFrom(this.api.delete(`/admin/notifications/${n.id}`)); this.sel.set(null); await this.refresh();
  }
  async deleteRead(): Promise<void> {
    if (!(await this.dlg.confirm('Delete all read notifications?'))) return;
    const r = await firstValueFrom(this.api.delete<{ deleted: number }>('/admin/notifications/read')); await this.refresh();
    void this.dlg.info(`${r.deleted} read notification(s) deleted.`);
  }
  async markAllRead(): Promise<void> { await firstValueFrom(this.api.post('/admin/notifications/read-all')); await this.refresh(); }

  async openReg(id: number): Promise<void> {
    try { this.regSel.set(await firstValueFrom(this.api.get<RegistrationDetail>(`/admin/registrations/${id}`))); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
  fileLabel(k: string): string { return ({ PSA: 'PSA Birth Certificate', COE: 'Certificate of Enrollment', COR: 'Certificate of Registration', Grades: 'Latest Grades/TOR', Contract: 'Scholarship Contract' } as Record<string, string>)[k] ?? k; }
  async openFile(id: number, key: string): Promise<void> { try { await this.api.open(`/admin/registrations/${id}/files/${key}`); } catch (e) { void this.dlg.error(errorMessage(e)); } }

  async approve(r: RegistrationDetail): Promise<void> {
    if (!(await this.dlg.confirm(`Approve registration for ${r.firstName} ${r.lastName}?\n\nThis will create a scholar account and send welcome email.`, 'Confirm Approval'))) return;
    this.busy.set(true);
    try {
      const a = await firstValueFrom(this.api.post<RegistrationApproved>(`/admin/registrations/${r.id}/approve`));
      this.regSel.set(null); await this.refresh();
      void this.dlg.success(`✅ Registration approved!\n\n👤 ${a.fullName}\n🔢 ${a.scholarNumber}\n🆔 Username (Student ID): ${a.studentId}\n${a.emailSent ? `📧 Login details sent to ${r.email}` : '⚠️ Email could not be sent — reset the credentials manually.'}`);
    } catch (e) { void this.dlg.error(errorMessage(e)); } finally { this.busy.set(false); }
  }

  async reject(): Promise<void> {
    const r = this.regSel(); if (!r) return;
    if (!this.rejectReason.trim()) { void this.dlg.warning('Please enter a rejection reason.'); return; }
    try {
      const res = await firstValueFrom(this.api.post<{ emailSent: boolean }>(`/admin/registrations/${r.id}/reject`, { reason: this.rejectReason.trim(), sendEmail: this.rejectEmail }));
      this.rejectOpen.set(false); this.rejectReason = ''; this.regSel.set(null); await this.refresh();
      void this.dlg.info(`Registration rejected.${this.rejectEmail ? (res.emailSent ? `\n📧 Rejection email sent to ${r.email}` : `\n⚠️ Failed to send rejection email to ${r.email}`) : ''}`, 'Registration Rejected');
    } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
}
