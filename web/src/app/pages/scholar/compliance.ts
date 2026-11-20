import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, statusColor } from '../../core/format';
import { ComplianceItem, ScholarCompliance } from '../../core/models';
import { AppIcon } from '../../shared/icon';
import { ScrollCue } from '../../shared/scroll-cue';

@Component({
  selector: 'app-scholar-compliance',
  imports: [ScrollCue, AppIcon, FormsModule, DatePipeShort],
  template: `
    <div class="mb-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
      <div class="card flex h-[110px] items-center gap-4 px-5"><app-icon name="file" class="card-icon h-[45px] w-[45px]"></app-icon><div><p class="text-[11pt] font-bold text-label">Total Requirements</p><p class="text-[30px] font-bold text-brand">{{ data()?.total ?? 0 }}</p></div></div>
      <div class="card flex h-[110px] items-center gap-4 px-5"><app-icon name="checked" class="card-icon h-[45px] w-[45px]"></app-icon><div><p class="text-[11pt] font-bold text-label">Completed</p><p class="text-[30px] font-bold text-ok">{{ data()?.completed ?? 0 }}</p></div></div>
      <div class="card flex h-[110px] items-center gap-4 px-5"><app-icon name="wall-clock" class="card-icon h-[45px] w-[45px]"></app-icon><div><p class="text-[11pt] font-bold text-label">Pending</p><p class="text-[30px] font-bold text-warn">{{ data()?.pending ?? 0 }}</p></div></div>
      <div class="card flex h-[110px] items-center gap-4 px-5"><app-icon name="reject" class="card-icon h-[45px] w-[45px]"></app-icon><div><p class="text-[11pt] font-bold text-label">Overdue</p><p class="text-[30px] font-bold text-danger">{{ data()?.overdue ?? 0 }}</p></div></div>
      <div class="card flex h-[110px] flex-col justify-center px-5"><p class="text-[12pt] font-bold text-label">Compliance Rate</p><p class="text-[28px] font-bold text-brand">{{ data()?.rate ?? 0 }}%</p>
        <div class="h-[10px] w-full overflow-hidden rounded bg-[#e6e6e6]"><div class="h-full bg-ok" [style.width.%]="data()?.rate ?? 0"></div></div></div>
    </div>

    @if (toDo() > 0) {
      <div class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border-l-4 border-warn bg-[#fff8e6] px-5 py-3" role="status">
        <p class="flex-1 text-[12pt] font-bold text-brand">{{ toDo() }} {{ toDo() === 1 ? 'requirement still needs' : 'requirements still need' }} your document.
          <span class="font-normal text-[#646464]">Use the Upload button in the Action column.</span></p>
        <button class="btn btn-brand !h-[32px]" (click)="status = 'All'; type = 'All Types'; showToDo()">Show what to upload</button>
      </div>
    }

    <div class="card mb-4 flex flex-wrap items-center gap-3 p-4">
      <label class="text-[11pt] font-bold text-label">Status:</label>
      <select class="input !w-[150px]" [(ngModel)]="status"><option>All</option>@for (s of statuses; track s) { <option>{{ s }}</option> }</select>
      <label class="text-[11pt] font-bold text-label">Type:</label>
      <select class="input !w-[220px]" [(ngModel)]="type"><option>All Types</option>@for (t of types(); track t) { <option>{{ t }}</option> }</select>
      <div class="ml-auto flex gap-2"><button class="btn btn-gray" (click)="status = 'All'; type = 'All Types'">Clear</button><button class="btn btn-brand" (click)="load()">Refresh</button></div>
    </div>

    <div class="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section class="card overflow-hidden">
        <div scrollCue class="grid-wrap max-h-[520px]"><table class="dgrid">
          <thead><tr><th>ID</th><th>Requirement Type</th><th>Due Date</th><th>Date Submitted</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>@for (c of filtered(); track c.id; let i = $index) {
            <tr class="cursor-pointer" [class.alt]="i % 2 === 1" [class.sel]="sel()?.id === c.id" (click)="sel.set(c)">
              <td>{{ c.id }}</td><td class="wrap font-bold">{{ c.requirementType }}</td><td>{{ c.dueDate | dmy }}</td><td>{{ c.dateSubmitted | dmy }}</td>
              <td><span class="font-bold" [style.color]="color(c.status)">{{ c.status }}</span></td>
              <td class="whitespace-nowrap">
                @if (canUpload(c)) {
                  <label class="btn btn-ok !h-[26px] !px-3 !text-[12px]" [class.opacity-60]="busy()" (click)="$event.stopPropagation()">{{ c.status === 'Rejected' ? 'Re-upload' : 'Upload' }}
                    <input type="file" class="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" [disabled]="busy()" (change)="upload($event, c)" /></label>
                } @else if (c.fileCount) { <button class="btn btn-accent !h-[26px] !px-3 !text-[12px]" (click)="$event.stopPropagation(); view(c)">View file</button> }
              </td></tr>
          } @empty { <tr><td colspan="6" class="!py-8 text-center text-[#969696]">No requirements found</td></tr> }</tbody></table></div>
        <p class="px-3 py-2 text-[9pt] text-muted">Showing {{ filtered().length }} records</p>
      </section>

      <aside class="card p-5">
        <h2 class="mb-3 text-[16pt] font-bold text-brand">Requirement Details</h2>
        @if (sel(); as c) {
          <p class="mb-3 text-[14pt] font-bold text-brand">#{{ c.id }}</p>
          <p class="text-[10pt] font-bold text-label">Requirement Type:</p><p class="mb-2 text-[12pt]">{{ c.requirementType }}</p>
          <p class="text-[10pt] font-bold text-label">Description:</p><p class="mb-2 text-[11pt]">{{ c.description || '-' }}</p>
          <p class="text-[10pt] font-bold text-label">Due Date:</p><p class="mb-2 text-[12pt]">{{ c.dueDate | dmy }}</p>
          <p class="text-[10pt] font-bold text-label">Date Submitted:</p><p class="mb-2 text-[12pt]">{{ c.dateSubmitted | dmy }}</p>
          <p class="text-[10pt] font-bold text-label">Status:</p><p class="mb-2 text-[12pt] font-bold" [style.color]="color(c.status)">{{ c.status }}</p>
          <p class="text-[10pt] font-bold text-label">Remarks:</p><p class="mb-2 text-[11pt]">{{ c.remarks || '-' }}</p>
          <p class="text-[10pt] font-bold text-label">Checked By:</p><p class="mb-3 text-[12pt]">{{ c.checkedBy || '-' }}</p>
          @if (c.status === 'Submitted') { <p class="mb-2 rounded bg-[#eef8f8] p-2 text-[11pt] text-label">Received. Waiting for the administrator to review it. If you registered online, this is the document you uploaded then.</p> }
          @if (c.fileCount) { <button class="btn btn-accent mb-2 w-full" (click)="view(c)">📎 {{ c.fileName || 'View uploaded file' }}</button> }
          @if (c.status === 'Pending' || c.status === 'Rejected' || c.status === 'Overdue') {
            <label class="btn btn-ok w-full !h-[40px]" [class.opacity-60]="busy()">⬆ Upload Document
              <input type="file" class="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" [disabled]="busy()" (change)="upload($event, c)" /></label>
            <p class="mt-1 text-[11px] text-muted">PDF, Word or image, up to 10 MB.</p>
          }
        } @else { <p class="text-[12px] text-muted">Select a requirement to see its details.</p> }
      </aside>
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
  color = statusColor;
  get status() { return this.statusSig(); } set status(v: string) { this.statusSig.set(v); }
  get type() { return this.typeSig(); } set type(v: string) { this.typeSig.set(v); }
  types = computed(() => [...new Set((this.data()?.items ?? []).map((i) => i.requirementType))]);
  filtered = computed(() => (this.data()?.items ?? []).filter((i) => (this.statusSig() === 'All' || i.status === this.statusSig()) && (this.typeSig() === 'All Types' || i.requirementType === this.typeSig())));

  canUpload = (c: ComplianceItem): boolean => c.status === 'Pending' || c.status === 'Rejected' || c.status === 'Overdue';
  toDo = computed(() => (this.data()?.items ?? []).filter((i) => this.canUpload(i)).length);
  showToDo(): void { const first = (this.data()?.items ?? []).find((i) => this.canUpload(i)); if (first) this.sel.set(first); }

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    try {
      const keep = this.sel()?.id;
      this.data.set(await firstValueFrom(this.api.get<ScholarCompliance>('/scholar/compliance')));
      this.sel.set(this.data()!.items.find((i) => i.id === keep) ?? null);
    } catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  async view(c: ComplianceItem): Promise<void> { try { await this.api.open(`/scholar/compliance/${c.id}/file`); } catch (e) { void this.dlg.error(errorMessage(e)); } }

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
