// =====================================================================
// compliance.ts - Compliance (/scholar/compliance).
// The scholar sees each required document and uploads the missing ones.
//
// Upload flow: upload() -> POST /api/scholar/compliance/{id}/file
// -> status becomes "Submitted" -> the admin reviews it (Approved / Rejected).
// Upload is allowed only for Pending, Rejected or Overdue items (canUpload).
// Live: reloads when an admin changes this scholar's compliance.
// =====================================================================
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RealtimeService, reloadOn } from '../../core/realtime';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, statusColor, RequirementNamePipe, requirementName, tint } from '../../core/format';
import { ComplianceItem, ScholarCompliance } from '../../core/models';
import { AppIcon } from '../../shared/icon';
import { ScrollCue } from '../../shared/scroll-cue';
import { StatItem, StatStrip } from '../../shared/stat-strip';

@Component({
  selector: 'app-scholar-compliance',
  imports: [StatStrip, RequirementNamePipe, ScrollCue, AppIcon, FormsModule, DatePipeShort],
  template: `
    <app-stat-strip [items]="stats()" />

    @if (toDo() > 0) {
      <div class="mt-4 flex items-start gap-3 rounded-lg border-l-4 border-warn bg-[#fff8e6] px-5 py-3" role="status">
        <app-icon name="alert" class="mt-[2px] h-5 w-5 shrink-0 text-[#8a5300]"></app-icon>
        <p class="text-[14px] text-ink"><b class="text-brand">{{ toDo() }} {{ toDo() === 1 ? 'document is' : 'documents are' }} still needed:</b> {{ todoNames() }}. Press <b>Upload</b> on its row to send each one.</p>
      </div>
    }

    <div class="card my-4 flex flex-wrap items-end gap-3 p-4">
      <div><label for="cf-status" class="mb-1 block text-[12px] font-bold text-[#4b5563]">Status</label>
        <select id="cf-status" class="input !w-[150px]" [(ngModel)]="status"><option>All</option>@for (s of statuses; track s) { <option>{{ s }}</option> }</select></div>
      <div><label for="cf-type" class="mb-1 block text-[12px] font-bold text-[#4b5563]">Requirement</label>
        <select id="cf-type" class="input !w-[240px] max-w-full" [(ngModel)]="type"><option>All Types</option>@for (t of types(); track t) { <option [value]="t">{{ t | reqName }}</option> }</select></div>
      @if (status !== 'All' || type !== 'All Types') { <button class="btn btn-gray !h-[36px]" (click)="status = 'All'; type = 'All Types'">Clear filters</button> }
    </div>

    <div class="grid items-start gap-5" [class]="sel() ? 'xl:grid-cols-[1fr_360px]' : ''">
      <section class="card overflow-hidden">
        <!-- Phones: one card per requirement, with its button in view -->
        <ul class="divide-y divide-[#eeeeee] md:hidden">
          @for (c of filtered(); track c.id) {
            <li class="px-4 py-3" [class.bg-[#e6f5f5]]="sel()?.id === c.id">
              <button class="flex w-full items-start gap-3 text-left" (click)="sel.set(c)">
                <div class="min-w-0 flex-1"><p class="font-bold text-ink">{{ c.requirementType | reqName }}</p>
                  <p class="text-[12px] text-[#4b5563]">Due {{ c.dueDate | dmy }}@if (c.dateSubmitted) { · Sent {{ c.dateSubmitted | dmy }} }</p>
                  @if (c.status === 'Rejected' && c.remarks) { <p class="text-[12px] text-[#b42318]">Why: {{ c.remarks }}</p> }</div>
                <span class="shrink-0 rounded-full px-2 py-[2px] text-[12px] font-bold" [style.background]="tint(color(c.status))" [style.color]="color(c.status)">{{ c.status }}</span>
              </button>
              @if (canUpload(c)) {
                <label class="btn btn-ok mt-2 w-full !h-[38px]" [class.opacity-60]="busy()">{{ c.status === 'Rejected' ? 'Upload a new copy' : 'Upload document' }}
                  <input type="file" class="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" [disabled]="busy()" (change)="upload($event, c)" /></label>
              } @else if (c.fileCount) { <button class="btn btn-outline mt-2 w-full !h-[38px]" (click)="view(c)">View my file</button> }
            </li>
          } @empty { <li class="px-4 py-8 text-center text-[13px] text-[#4b5563]">No requirements found</li> }
        </ul>
        <!-- Tablets and up: the full table -->
        <div scrollCue class="grid-wrap hidden max-h-[520px] md:block"><table class="dgrid">
          <thead><tr><th>Requirement</th><th>Due Date</th><th>Date Submitted</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>@for (c of filtered(); track c.id; let i = $index) {
            <tr class="cursor-pointer" [class.alt]="i % 2 === 1" [class.sel]="sel()?.id === c.id" (click)="sel.set(c)">
              <td class="wrap"><b>{{ c.requirementType | reqName }}</b>
                @if (c.status === 'Rejected' && c.remarks) { <p class="text-[12px] text-[#b42318]">Why: {{ c.remarks }}</p> }</td>
              <td>{{ c.dueDate | dmy }}</td><td>{{ c.dateSubmitted | dmy: '—' }}</td>
              <td><span class="rounded-full px-2 py-[2px] text-[12px] font-bold" [style.background]="tint(color(c.status))" [style.color]="color(c.status)">{{ c.status }}</span></td>
              <td class="whitespace-nowrap">
                @if (canUpload(c)) {
                  <label class="btn btn-ok !h-[26px] !px-3 !text-[12px]" [class.opacity-60]="busy()" (click)="$event.stopPropagation()">{{ c.status === 'Rejected' ? 'Re-upload' : 'Upload' }}
                    <input type="file" class="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" [disabled]="busy()" (change)="upload($event, c)" /></label>
                } @else if (c.fileCount) { <button class="btn btn-accent !h-[26px] !px-3 !text-[12px]" (click)="$event.stopPropagation(); view(c)">View file</button> }
              </td></tr>
          } @empty { <tr><td colspan="5" class="!py-8 text-center text-[#4b5563]">No requirements found</td></tr> }</tbody></table></div>
        <p class="px-3 py-2 text-[12px] text-[#4b5563]">Showing {{ filtered().length }} {{ filtered().length === 1 ? 'requirement' : 'requirements' }} · click a row for details</p>
      </section>

      @if (sel()) {
        <!-- On phones the details slide up from the bottom (tap the dark area to close); on wide screens they sit beside the list. -->
        <div class="fixed inset-0 z-40 bg-black/40 xl:hidden" (click)="sel.set(null)" aria-hidden="true"></div>
        <aside class="card fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-b-none p-5 shadow-2xl xl:static xl:z-auto xl:max-h-none xl:rounded-b-xl xl:shadow-sm" role="dialog" aria-modal="true" (keydown.escape)="sel.set(null)">
        <div class="mb-3 flex items-center"><h2 class="text-[18px] font-bold text-brand">Requirement details</h2>
          <button class="ml-auto flex h-[32px] w-[32px] items-center justify-center rounded-full text-[22px] leading-none text-muted hover:bg-black/5 hover:text-black" aria-label="Close requirement details" (click)="sel.set(null)">×</button></div>
        @if (sel(); as c) {
          <p class="text-[13px] font-bold text-[#4b5563]">Requirement Type:</p><p class="mb-2 text-[14px]">{{ c.requirementType | reqName }}</p>
          <p class="text-[13px] font-bold text-[#4b5563]">Description:</p><p class="mb-2 text-[14px]">{{ c.description || '-' }}</p>
          <p class="text-[13px] font-bold text-[#4b5563]">Due Date:</p><p class="mb-2 text-[14px]">{{ c.dueDate | dmy }}</p>
          <p class="text-[13px] font-bold text-[#4b5563]">Date Submitted:</p><p class="mb-2 text-[14px]">{{ c.dateSubmitted | dmy }}</p>
          <p class="text-[13px] font-bold text-[#4b5563]">Status:</p><p class="mb-2 text-[14px] font-bold" [style.color]="color(c.status)">{{ c.status }}</p>
          <p class="text-[13px] font-bold text-[#4b5563]">Remarks:</p><p class="mb-2 text-[14px]">{{ c.remarks || '-' }}</p>
          <p class="text-[13px] font-bold text-[#4b5563]">Checked By:</p><p class="mb-3 text-[14px]">{{ c.checkedBy || '-' }}</p>
          @if (c.status === 'Submitted') { <p class="mb-2 rounded bg-[#eef8f8] p-2 text-[14px] text-[#4b5563]">Received. The Scholarship Office will review it and you will get a notification.</p> }
          @if (c.fileCount) { <button class="btn btn-accent mb-2 w-full" (click)="view(c)"><app-icon name="attachment" class="mr-1 inline-flex h-4 w-4 align-[-3px]"></app-icon>{{ c.fileName || 'View uploaded file' }}</button> }
          @if (c.status === 'Pending' || c.status === 'Rejected' || c.status === 'Overdue') {
            <label class="btn btn-ok w-full !h-[40px]" [class.opacity-60]="busy()"><app-icon name="attachment" class="mr-1 inline-flex h-4 w-4 align-[-3px]"></app-icon>Upload Document
              <input type="file" class="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" [disabled]="busy()" (change)="upload($event, c)" /></label>
            <p class="mt-1 text-[12px] text-[#4b5563]">PDF, Word or image, up to 10 MB.</p>
          }
        }
      </aside> }
    </div>
  `,
})
export class ScholarCompliancePage implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  data = signal<ScholarCompliance | null>(null);
  sel = signal<ComplianceItem | null>(null);
  busy = signal(false);
  statuses = ['Pending', 'Submitted', 'Approved', 'Rejected', 'Overdue'];
  statusSig = signal('All'); typeSig = signal('All Types');
  color = statusColor; tint = tint;
  // getters/setters let [(ngModel)] work with the signals above.
  get status() { return this.statusSig(); } set status(v: string) { this.statusSig.set(v); }
  get type() { return this.typeSig(); } set type(v: string) { this.typeSig.set(v); }
  types = computed(() => [...new Set((this.data()?.items ?? []).map((i) => i.requirementType))]);
  // Rows that match the status and type filters (filtered in the browser).
  filtered = computed(() => (this.data()?.items ?? []).filter((i) => (this.statusSig() === 'All' || i.status === this.statusSig()) && (this.typeSig() === 'All Types' || i.requirementType === this.typeSig())));

  // Number cards at the top.
  stats = computed<StatItem[]>(() => {
    const d = this.data();
    return [
      { label: 'Requirements', value: d?.total ?? 0 },
      { label: 'Completed', value: d?.completed ?? 0, tone: 'ok' },
      { label: 'To submit', value: d?.pending ?? 0, tone: 'pending' },
      { label: 'Overdue', value: d?.overdue ?? 0, tone: 'danger' },
      { label: 'Compliance rate', value: (d?.rate ?? 0) + '%', progress: d?.rate ?? 0 },
    ];
  });
  // Items that still need a file from the scholar.
  canUpload = (c: ComplianceItem): boolean => c.status === 'Pending' || c.status === 'Rejected' || c.status === 'Overdue';
  todoNames = computed(() => (this.data()?.items ?? []).filter((i) => this.canUpload(i)).map((i) => requirementName(i.requirementType)).join(', '));
  toDo = computed(() => (this.data()?.items ?? []).filter((i) => this.canUpload(i)).length);

  constructor() {
    const rt = inject(RealtimeService);
    reloadOn([rt.complianceChanged$], () => this.load());
  }

  ngOnInit(): void { void this.load(); }

  // Load the list, keeping the same row selected if it still exists.
  async load(): Promise<void> {
    try {
      const keep = this.sel()?.id;
      this.data.set(await firstValueFrom(this.api.get<ScholarCompliance>('/scholar/compliance')));
      this.sel.set(this.data()!.items.find((i) => i.id === keep) ?? null);
    } catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  // Open the uploaded file in a new tab.
  async view(c: ComplianceItem): Promise<void> { try { await this.api.open(`/scholar/compliance/${c.id}/file`); } catch (e) { void this.dlg.error(errorMessage(e)); } }

  // Upload a file (max 10 MB) for one requirement.
  async upload(ev: Event, c: ComplianceItem): Promise<void> {
    const input = ev.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) { void this.dlg.warning('File is too large (max 10 MB).'); input.value = ''; return; }
    const fd = new FormData(); fd.append('file', file, file.name);
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.upload(`/scholar/compliance/${c.id}/file`, fd));
      await this.load();
      void this.dlg.success('Document uploaded successfully! Waiting for administrator verification.', 'Upload Complete');
    } catch (e) { void this.dlg.error(errorMessage(e), 'Upload failed'); } finally { this.busy.set(false); input.value = ''; }
  }
}
