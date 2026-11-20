import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { ToastService } from '../../core/toast';
import { DatePipeShort, DateTimePipe, NOTIFICATION_COLORS, PesoPipe, relativeTime, statusColor } from '../../core/format';
import { ComposeResult, NotificationItem, NotificationStats, Option, RegistrationApproved, RegistrationDetail, RegistrationListItem } from '../../core/models';
import { Modal } from '../../shared/modal';
import { Fact, FactGrid } from '../../shared/fact-grid';
import { AppIcon } from '../../shared/icon';
import { ScrollCue } from '../../shared/scroll-cue';
import { StatItem, StatStrip } from '../../shared/stat-strip';

@Component({
  selector: 'app-notifications',
  imports: [FactGrid, StatStrip, ScrollCue, AppIcon, FormsModule, DateTimePipe, DatePipeShort, PesoPipe, Modal],
  template: `
    @if (tab() === 'notifs') { <app-stat-strip [items]="cards()" /> }

    @if (tab() === 'notifs') {
      <div class="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div><label class="field-label-b">Search</label><input class="input !w-[170px]" [ngModel]="search()" (ngModelChange)="search.set($event); reloadSoon()" /></div>
        <div><label class="field-label-b">Recipient</label>
          <select class="input !w-[180px]" [ngModel]="recipientFilter()" (ngModelChange)="recipientFilter.set($event); loadList()"><option [ngValue]="0">All Recipients</option>@for (r of recipients(); track r.id) { <option [ngValue]="r.id">{{ r.name }}</option> }</select></div>
        <div><label class="field-label-b">Type</label>
          <select class="input !w-[150px]" [ngModel]="typeFilter()" (ngModelChange)="typeFilter.set($event); loadList()"><option>All Types</option>@for (t of types; track t) { <option>{{ t }}</option> }</select></div>
        <div><label class="field-label-b">Method</label><select class="input !w-[130px]" disabled><option>In-App</option></select></div>
        <label class="flex items-center gap-2 pb-1 text-[13px]"><input type="checkbox" [ngModel]="unreadOnly()" (ngModelChange)="unreadOnly.set($event); loadList()" /> Unread only</label>
        <div class="ml-auto flex flex-wrap items-center gap-2">
          <button class="btn btn-accent" (click)="refresh()">Refresh</button>
          <button class="btn btn-gray" (click)="clearFilters()">Clear filters</button>
          <button class="btn btn-brand" (click)="markAllRead()">Mark All Read</button>
          <span class="mx-2 h-[28px] w-px bg-[#c9c9c9]" aria-hidden="true"></span>
          <button class="btn btn-danger-outline" (click)="deleteRead()">Delete All Read…</button>
        </div>
      </div>

      <div class="grid items-start gap-4" [class]="sel() ? 'xl:grid-cols-[360px_1fr_260px]' : 'xl:grid-cols-[360px_1fr]'">
        <section class="card p-5">
          <h2 class="mb-3 text-[14pt] font-bold text-accent">Compose Notification</h2>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label-b">Recipient</label>
              <select class="input" [(ngModel)]="c.recipientId"><option [ngValue]="0">All Active Scholars</option>@for (r of recipients(); track r.id) { <option [ngValue]="r.id">{{ r.name }}</option> }</select></div>
            <div><label class="field-label-b">Notification Type</label><select class="input" [(ngModel)]="c.type">@for (t of composeTypes; track t) { <option>{{ t }}</option> }</select></div>
          </div>
          <div class="my-3 flex gap-6 text-[13px]">
            <label class="flex items-center gap-2"><input type="checkbox" checked disabled /> Send In-App</label>
            <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="c.sendEmail" /> Send email</label>
            <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="c.sendSms" /> Send SMS</label>
          </div>
          <label class="field-label-b">Notification Title</label><input class="input mb-3" [(ngModel)]="c.title" maxlength="200" />
          <label class="field-label-b">Message</label><textarea class="input mb-4" rows="8" [(ngModel)]="c.message" maxlength="4000"></textarea>
          <div class="flex justify-between">
            <button class="btn btn-gray !h-[50px] w-[120px]" (click)="clearCompose()">Clear Form</button>
            <button class="btn btn-ok !h-[50px] w-[200px] !text-[14px]" [disabled]="busy()" (click)="send()"><app-icon name="bell" class="h-5 w-5"></app-icon>Send Notification</button>
          </div>
        </section>

        <section class="card overflow-hidden">
          <div scrollCue class="grid-wrap max-h-[560px]">
            <table class="dgrid">
              <thead><tr><th>ID</th><th>Date</th><th>Recipient</th><th>Title</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>
                @for (n of list(); track n.id; let i = $index) {
                  <tr class="cursor-pointer" [class.alt]="i % 2 === 1" [class.sel]="sel()?.id === n.id" [class.font-bold]="!n.isRead" (click)="show(n)">
                    <td>{{ n.id }}</td><td class="whitespace-nowrap" [title]="n.dateCreated | dt">{{ rel(n.dateCreated) }}</td><td>{{ n.recipientName }}</td><td class="wrap">{{ n.title }}</td>
                    <td><span [style.color]="tcolor(n.type)">{{ n.type }}</span></td><td>{{ n.isRead ? 'Read' : 'Unread' }}</td>
                  </tr>
                } @empty { <tr><td colspan="6" class="!py-8 text-center text-[#595959]">No notifications</td></tr> }
              </tbody>
            </table>
          </div>
        </section>

        @if (sel()) { <aside class="card p-4">
          <h2 class="mb-3 text-[12pt] font-bold text-accent">Notification Details</h2>
          @if (sel(); as n) {
            <p class="text-[12px]">Date: {{ n.dateCreated | dt }}</p><p class="text-[12px]">Sender: {{ n.senderName }}</p><p class="text-[12px]">Recipient: {{ n.recipientName }}</p>
            <p class="text-[12px]">Type: {{ n.type }}</p><p class="text-[12px]">Delivery Method: In-App</p><p class="mb-2 text-[12px]">Status: {{ n.isRead ? 'Read' : 'Unread' }}</p>
            <p class="mb-1 text-[10pt] font-bold">Message:</p>
            <div class="mb-3 max-h-[260px] overflow-auto whitespace-pre-wrap rounded bg-surface p-2 text-[12px]">{{ n.message }}</div>
            <button class="btn btn-accent mb-2 w-full" (click)="resend(n)">Resend Notification</button>
            <button class="btn btn-danger w-full" (click)="remove(n)">Delete</button>
          }
        </aside> }
      </div>
    } @else {
      <div class="grid items-start gap-4" [class]="regSel() ? 'xl:grid-cols-[480px_1fr]' : ''">
        <section class="card max-h-[640px] overflow-auto p-3">
          @for (r of regs(); track r.id) {
            <button class="mb-2 w-full rounded-lg border p-3 text-left transition hover:bg-[#f0f7f8]" [class.border-accent]="regSel()?.id === r.id" [class.border-[#e6e6e6]]="regSel()?.id !== r.id" (click)="openReg(r.id)">
              <div class="flex items-center"><b class="text-[14px] text-brand">{{ r.fullName }}</b><span class="ml-auto text-[12px] font-bold" [style.color]="color(r.status)">{{ r.status }}</span></div>
              <p class="text-[12px] text-muted">{{ r.email }} · {{ r.contactNumber }}</p>
              <p class="truncate text-[12px]">{{ r.course }} — {{ r.yearLevel }}</p><p class="text-[12px] text-[#595959]">Submitted {{ rel(r.createdAt) }}</p>
            </button>
          } @empty { <p class="p-6 text-center text-[13px] text-[#595959]">No registrations</p> }
        </section>

        @if (regSel()) { <section class="card p-5">
          @if (regSel(); as r) {
            <div class="mb-3 flex items-center"><h2 class="text-[14pt] font-bold text-accent">{{ r.firstName }} {{ r.middleName }} {{ r.lastName }}</h2>
              <span class="ml-3 text-[13px] font-bold" [style.color]="color(r.status)">{{ r.status }}</span></div>
            <dl class="grid grid-cols-[160px_1fr] gap-y-1 text-[13px]">
              <dt class="text-muted">Student ID</dt><dd>{{ r.studentId || '(will be generated)' }}</dd>
              <dt class="text-muted">Email</dt><dd>{{ r.email || '—' }}</dd><dt class="text-muted">Contact</dt><dd>{{ r.contactNumber || '—' }}</dd>
              <dt class="text-muted">Date of Birth</dt><dd>{{ r.dateOfBirth | dmy: '—' }}</dd><dt class="text-muted">Gender</dt><dd>{{ r.gender || '—' }}</dd>
              <dt class="text-muted">Address</dt><dd>{{ r.address || '—' }}</dd><dt class="text-muted">Program / HEI</dt><dd>{{ r.program || '—' }} · {{ r.hei || '—' }}</dd>
              <dt class="text-muted">Degree Program</dt><dd>{{ r.degreeProgram || '—' }}</dd><dt class="text-muted">Year Level</dt><dd>{{ r.yearLevel || '—' }}</dd>
              <dt class="text-muted">Scholarship</dt><dd>{{ r.scholarshipName }} — {{ r.stipendAmount | peso }} / {{ r.stipendFrequency }}</dd>
              <dt class="text-muted">Fund Source</dt><dd>{{ r.scholarshipFundSource || '—' }}</dd><dt class="text-muted">Renewal</dt><dd>{{ r.renewalConditions || '—' }}</dd>
              <dt class="text-muted">Enrollment / Graduation</dt><dd>{{ r.enrollmentDate || r.expectedGraduation ? (r.enrollmentDate | dmy: '—') + ' to ' + (r.expectedGraduation | dmy: '—') : '—' }}</dd>
              <dt class="text-muted">Bank</dt><dd>{{ r.bankName || r.bankAccountNumber ? (r.bankName ?? '') + ' ' + (r.bankAccountNumber ?? '') : '—' }}</dd><dt class="text-muted">Notes</dt><dd>{{ r.notes || '—' }}</dd>
              @if (r.rejectionReason) { <dt class="text-muted">Rejection reason</dt><dd class="text-danger">{{ r.rejectionReason }}</dd> }
            </dl>
            <h3 class="section-title mt-4">Attached Documents</h3>
            <div class="mb-4 flex flex-wrap gap-2">
              @for (k of r.files; track k) { <button class="btn btn-brand" (click)="openFile(r.id, k)"><app-icon name="attachment" class="mr-1 inline-flex h-4 w-4 align-[-3px]"></app-icon>{{ fileLabel(k) }}</button> } @empty { <span class="text-[13px] text-[#4b5563]">No documents attached.</span> }
            </div>
            @if (r.status === 'Pending' && missingDocs(r).length) {
              <div class="mb-4 flex items-start gap-3 rounded-lg border-l-4 border-warn bg-[#fff8e6] px-4 py-3" role="alert">
                <app-icon name="alert" class="mt-[2px] h-5 w-5 shrink-0 text-[#8a5300]"></app-icon>
                <p class="text-[13px] text-[#333]">Required documents missing: <b>{{ missingDocs(r).join(', ') }}</b>. You can still approve, but the scholar will have these requirements marked as not submitted.</p>
              </div>
            }
            @if (r.status === 'Pending') {
              <div class="flex gap-3"><button class="btn btn-ok !h-[40px]" [disabled]="busy()" (click)="approve(r)"><app-icon name="checked" class="mr-1 inline-flex h-4 w-4 align-[-3px]"></app-icon>Approve</button><button class="btn btn-danger !h-[40px]" [disabled]="busy()" (click)="rejectOpen.set(true)"><app-icon name="reject" class="mr-1 inline-flex h-4 w-4 align-[-3px]"></app-icon>Reject</button></div>
            }
          }
        </section> }
      </div>
    }

    @if (rejectOpen()) {
      <app-modal title="Reject this application" [width]="520" (closed)="rejectOpen.set(false); rejectErr.set('')">
        <p class="mb-2 text-[14px]">Tell the applicant why. The reason is saved with the application and can be emailed to:</p>
        <p class="mb-3 text-[14px] font-bold text-brand">{{ regSel()?.email }}</p>
        <label class="field-label-b" for="rej-reason">Reason <span class="text-[#c62828]">*</span></label>
        <textarea id="rej-reason" class="input" [class.input-invalid]="!!rejectErr()" rows="5" [(ngModel)]="rejectReason" (ngModelChange)="rejectErr.set('')" maxlength="1000"></textarea>
        @if (rejectErr()) { <p class="field-err">{{ rejectErr() }}</p> }
        <label class="mt-3 flex items-center gap-2 text-[14px]"><input type="checkbox" [(ngModel)]="rejectEmail" /> Send the reason to the applicant by email</label>
        <div class="mt-5 flex justify-end gap-2"><button class="btn btn-gray" (click)="rejectOpen.set(false); rejectErr.set('')">Cancel</button><button class="btn btn-danger" (click)="reject()">Reject application</button></div>
      </app-modal>
    }

    @if (approvedDlg(); as v) {
      <app-modal title="Registration approved" [width]="560" (closed)="approvedDlg.set(null)">
        <div class="mb-4 flex items-center gap-3"><app-icon name="checked" class="h-[40px] w-[40px] text-ok"></app-icon>
          <p class="text-[14px] text-[#333]">A scholar account was created for {{ v.a.fullName }}.</p></div>
        <app-fact-grid [facts]="approvedFacts(v)" />
        <div class="mt-4 flex items-start gap-3 rounded-lg px-4 py-3" [class.bg-[#eef8f8]]="v.a.emailSent" [class.bg-[#fff8e6]]="!v.a.emailSent" [attr.role]="v.a.emailSent ? null : 'alert'">
          <app-icon [name]="v.a.emailSent ? 'mail' : 'alert'" class="mt-[2px] h-5 w-5 shrink-0" [class.text-accent]="v.a.emailSent" [class.text-[#8a5300]]="!v.a.emailSent"></app-icon>
          <p class="text-[13px] text-[#333]">@if (v.a.emailSent) { Login details were emailed to <b>{{ v.email }}</b>. } @else { The email could not be sent. Reset the scholar's credentials manually and give them to {{ v.a.fullName }}. }</p>
        </div>
        <div class="mt-5 flex justify-end"><button class="btn btn-brand !h-[40px]" (click)="approvedDlg.set(null)">Done</button></div>
      </app-modal>
    }

    @if (rejectedDlg(); as v) {
      <app-modal title="Registration rejected" [width]="520" (closed)="rejectedDlg.set(null)">
        <div class="mb-4 flex items-center gap-3"><app-icon name="reject" class="h-[40px] w-[40px] text-[#b42318]"></app-icon>
          <p class="text-[14px] text-[#333]">{{ v.name }}'s application was rejected.</p></div>
        @if (v.asked) {
          <div class="flex items-start gap-3 rounded-lg px-4 py-3" [class.bg-[#eef8f8]]="v.sent" [class.bg-[#fff8e6]]="!v.sent">
            <app-icon [name]="v.sent ? 'mail' : 'alert'" class="mt-[2px] h-5 w-5 shrink-0" [class.text-accent]="v.sent" [class.text-[#8a5300]]="!v.sent"></app-icon>
            <p class="text-[13px] text-[#333]">@if (v.sent) { A rejection email with your reason was sent to <b>{{ v.email }}</b>. } @else { The rejection email to {{ v.email }} could not be sent. }</p>
          </div>
        }
        <div class="mt-5 flex justify-end"><button class="btn btn-brand !h-[40px]" (click)="rejectedDlg.set(null)">Done</button></div>
      </app-modal>
    }
  `,
})
export class NotificationsPage implements OnInit, OnDestroy {
  private api = inject(Api);
  private dlg = inject(DialogService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  constructor() { this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((q) => this.tab.set(q.get('tab') === 'reg' ? 'reg' : 'notifs')); }
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
      { label: 'Total Sent', value: s?.total ?? 0, icon: 'bell', color: '#0a5c5c', hint: 'All in-app notifications sent (not affected by the filters below)' },
      { label: 'Unread', value: s?.unread ?? 0, icon: 'wall-clock', color: '#8a5300', tone: 'pending' as const, hint: 'In-app notifications scholars have not opened yet' },
      { label: 'Read', value: s?.read ?? 0, icon: 'checked', color: '#17692c', hint: 'In-app notifications scholars have opened' },
      { label: 'Awaiting Approval', value: s?.pendingRegistrations ?? 0, icon: 'file', color: '#b42318', tone: 'pending' as const, hint: 'New scholar registrations waiting for review' },
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

  // Deletes are applied after a short grace period so they can be undone (the API delete is permanent).
  private pending: { timer: ReturnType<typeof setTimeout>; commit: () => Promise<void> } | null = null;
  private async flush(): Promise<void> {
    const p = this.pending; if (!p) return;
    this.pending = null; clearTimeout(p.timer); await p.commit();
  }
  private deferDelete(message: string, hide: () => () => void, commit: () => Promise<unknown>): void {
    void this.flush();
    const restore = hide();
    const timer = setTimeout(() => void this.flush(), 8000);
    this.pending = { timer, commit: async () => {
      try { await commit(); } catch (e) { restore(); void this.dlg.error(errorMessage(e)); }
      await this.refresh();
    } };
    this.toast.show(message, { actionLabel: 'Undo', durationMs: 8000, onAction: () => { clearTimeout(timer); this.pending = null; restore(); } });
  }
  ngOnDestroy(): void { void this.flush(); }

  remove(n: NotificationItem): void {
    const before = this.list(); const wasSel = this.sel();
    this.deferDelete(`Notification “${n.title}” deleted.`, () => { this.list.set(before.filter((x) => x.id !== n.id)); this.sel.set(null); return () => { this.list.set(before); this.sel.set(wasSel); }; },
      () => firstValueFrom(this.api.delete(`/admin/notifications/${n.id}`)));
  }
  async deleteRead(): Promise<void> {
    const count = this.stats()?.read ?? 0;
    if (!count) { void this.dlg.info('There are no read notifications to delete.'); return; }
    if (!(await this.dlg.confirm(`Permanently delete ${count} read notification${count === 1 ? '' : 's'}?\n\nYou can undo for a few seconds afterwards.`, 'Delete read notifications', `Delete ${count}`, 'Keep them', true))) return;
    const before = this.list();
    this.deferDelete(`${count} read notification${count === 1 ? '' : 's'} deleted.`, () => { this.list.set(before.filter((x) => !x.isRead)); return () => this.list.set(before); },
      () => firstValueFrom(this.api.delete<{ deleted: number }>('/admin/notifications/read')));
  }
  async markAllRead(): Promise<void> {
    const n = this.stats()?.unread ?? 0;
    if (!n) { void this.dlg.info('Everything is already marked as read.'); return; }
    if (!(await this.dlg.confirm(`Mark ${n} unread notification${n === 1 ? '' : 's'} as read for all scholars?\n\nThis can't be reversed.`, 'Mark all as read', 'Mark as read', 'Cancel'))) return;
    await firstValueFrom(this.api.post('/admin/notifications/read-all')); await this.refresh();
  }

  async openReg(id: number): Promise<void> {
    try { this.regSel.set(await firstValueFrom(this.api.get<RegistrationDetail>(`/admin/registrations/${id}`))); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
  fileLabel(k: string): string { return ({ PSA: 'PSA Birth Certificate', COE: 'Certificate of Enrollment', COR: 'Certificate of Registration', Grades: 'Latest Grades/TOR', Contract: 'Scholarship Contract' } as Record<string, string>)[k] ?? k; }
  async openFile(id: number, key: string): Promise<void> { try { await this.api.open(`/admin/registrations/${id}/files/${key}`); } catch (e) { void this.dlg.error(errorMessage(e)); } }

  /** PSA, COE and COR are required at registration; list any that are not attached. */
  missingDocs(r: RegistrationDetail): string[] { return ['PSA', 'COE', 'COR'].filter((k) => !r.files.includes(k)).map((k) => this.fileLabel(k)); }
  rejectErr = signal('');
  approvedDlg = signal<{ a: RegistrationApproved; email: string } | null>(null);
  rejectedDlg = signal<{ name: string; email: string; asked: boolean; sent: boolean } | null>(null);
  private rejectEmailAsked = false;
  approvedFacts(v: { a: RegistrationApproved }): Fact[] {
    return [{ icon: 'user', label: 'Scholar', value: v.a.fullName }, { icon: 'scholar', label: 'Scholar number', value: v.a.scholarNumber, tone: 'strong' },
      { icon: 'file', label: 'Username (Student ID)', value: v.a.studentId, tone: 'strong' }];
  }

  async approve(r: RegistrationDetail): Promise<void> {
    const missing = this.missingDocs(r);
    if (!(await this.dlg.confirm(`Approve registration for ${r.firstName} ${r.lastName}?\n\nThis will create a scholar account and send a welcome email.${missing.length ? `\n\nMissing required documents: ${missing.join(', ')}.` : ''}`, 'Confirm Approval'))) return;
    this.busy.set(true);
    try {
      const a = await firstValueFrom(this.api.post<RegistrationApproved>(`/admin/registrations/${r.id}/approve`));
      this.regSel.set(null); await this.refresh();
      this.approvedDlg.set({ a, email: r.email });
    } catch (e) { void this.dlg.error(errorMessage(e)); } finally { this.busy.set(false); }
  }

  async reject(): Promise<void> {
    const r = this.regSel(); if (!r) return;
    this.rejectEmailAsked = this.rejectEmail;
    if (!this.rejectReason.trim()) { this.rejectErr.set('Please enter a reason for the rejection.'); document.getElementById('rej-reason')?.focus(); return; }
    try {
      const res = await firstValueFrom(this.api.post<{ emailSent: boolean }>(`/admin/registrations/${r.id}/reject`, { reason: this.rejectReason.trim(), sendEmail: this.rejectEmail }));
      this.rejectOpen.set(false); this.rejectReason = ''; this.regSel.set(null); await this.refresh();
      this.rejectedDlg.set({ name: `${r.firstName} ${r.lastName}`, email: r.email, asked: this.rejectEmailAsked, sent: res.emailSent });
    } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
}
