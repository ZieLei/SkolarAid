import { Component, inject, input, signal, effect, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, statusColor, RequirementNamePipe } from '../../core/format';
import { ComplianceItem, ComplianceScholarInfo, ComplianceScholarOption } from '../../core/models';
import { Modal } from '../../shared/modal';
import { ScrollCue } from '../../shared/scroll-cue';

/** Compliance Management tab of Scholar Management. */
@Component({
  selector: 'app-compliance-tab',
  host: { '(document:click)': 'closeAll()' },
  imports: [RequirementNamePipe, ScrollCue, FormsModule, Modal, DatePipeShort],
  template: `
    <div class="card mb-4 flex flex-wrap items-center gap-3 p-4">
      <label class="text-[13px] font-bold text-label" for="cs">Scholar:</label>
      <input id="cs" class="input !w-[360px]" list="scholar-options" placeholder="Type a name or scholar number…" autocomplete="off"
             [ngModel]="pickText()" (ngModelChange)="onPick($event)" aria-label="Scholar" />
      <datalist id="scholar-options">@for (s of options(); track s.id) { <option [value]="s.label"></option> }</datalist>
      @if (info(); as i) {
        <div class="ml-4 text-[13px]"><b class="text-brand">{{ i.fullName }}</b> · {{ i.scholarNumber }} · {{ i.course || '-' }} · {{ i.yearLevel || '-' }} · {{ i.scholarship || 'No scholarship' }}
          <span class="ml-2 rounded-full bg-[#f0f7f8] px-2 py-[2px] text-[12px] font-bold text-brand">{{ i.overall }}</span></div>
      } @else { <span class="text-[13px] text-muted">Please select a scholar</span> }
    </div>

    @if (info(); as i) {
      <div class="card p-4">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <button class="btn btn-brand" (click)="addOpen.set(true)">Add requirement</button>
          <button class="btn btn-outline" (click)="remind()">Remind scholar</button>
          <p class="ml-2 text-[13px] text-[#4b5563]">Use the buttons on each row to review, upload or view a document.</p>
        </div>
        <div scrollCue class="grid-wrap max-h-[480px] rounded border border-[#e6e6e6]">
          <table class="dgrid">
            <thead><tr><th>Requirement</th><th>Description</th><th>Due Date</th><th>Submitted</th><th>Status</th><th>File</th><th>Remarks</th><th>Actions</th></tr></thead>
            <tbody>
              @for (r of i.items; track r.id; let k = $index) {
                <tr [class.alt]="k % 2 === 1" [class.sel]="sel()?.id === r.id" (click)="selected.set(r.id)" (dblclick)="view()" class="cursor-pointer">
                  <td class="wrap font-bold">{{ r.requirementType | reqName }}</td><td class="wrap">{{ r.description }}</td>
                  <td>{{ r.dueDate | dmy }}</td><td>{{ r.dateSubmitted | dmy: '—' }}</td>
                  <td><span class="font-bold" [style.color]="color(r.status)">{{ r.status }}</span></td>
                  <td class="wrap">{{ r.fileCount ? (r.fileName || r.fileCount) : '—' }}</td><td class="wrap">{{ r.remarks || '—' }}</td>
                  <td class="whitespace-nowrap">
                    <div class="flex items-center gap-1">
                      <button class="btn btn-brand !h-[28px] !px-3 !text-[12px]" (click)="$event.stopPropagation(); selected.set(r.id); openStatus()">Review</button>
                      <label class="btn btn-outline !h-[28px] !px-3 !text-[12px]" (click)="$event.stopPropagation(); selected.set(r.id)">{{ r.fileCount ? 'Replace' : 'Upload' }}<input type="file" class="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" (change)="upload($event)" /></label>
                      @if (r.fileCount) { <button class="btn btn-outline !h-[28px] !px-3 !text-[12px]" (click)="$event.stopPropagation(); selected.set(r.id); view()">View</button> }
                      <details class="relative" (click)="$event.stopPropagation()" (toggle)="placeMenu($event)">
                        <summary class="btn btn-outline !h-[28px] !px-3 !text-[12px] cursor-pointer list-none" aria-label="More actions">More</summary>
                        <div class="absolute right-0 z-10 mt-1 w-[190px] rounded-lg border border-[#d4d4d4] bg-white py-1 text-left shadow-lg">
                          @if (r.status !== 'Overdue') { <button class="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#f3f4f6]" (click)="closeMenu($event); selected.set(r.id); markMissing()">Mark as missing</button> }
                          @if (r.fileCount) { <button class="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#f3f4f6]" (click)="closeMenu($event); selected.set(r.id); deleteFile()">Delete attached file</button> }
                          <button class="block w-full px-3 py-2 text-left text-[13px] font-bold text-[#b42318] hover:bg-[#fdecea]" (click)="closeMenu($event); selected.set(r.id); deleteReq()">Delete requirement</button>
                        </div>
                      </details>
                    </div>
                  </td>
                </tr>
              } @empty { <tr><td colspan="8" class="!py-6 text-center text-[#595959]">No requirements</td></tr> }
            </tbody>
          </table>
        </div>
      </div>
    }

    @if (statusOpen()) {
      <app-modal title="Update Status" [width]="420" (closed)="statusOpen.set(false)">
        <label class="field-label-b">New Status:</label>
        <select class="input mb-3" [(ngModel)]="newStatus">@for (s of statuses; track s) { <option>{{ s }}</option> }</select>
        <label class="field-label-b">Remarks:</label>
        <textarea class="input mb-4" rows="3" [(ngModel)]="remarks" maxlength="1000"></textarea>
        <div class="mt-5 flex justify-end gap-2"><button class="btn btn-gray" (click)="statusOpen.set(false)">Cancel</button><button class="btn btn-brand" (click)="saveStatus()">Update status</button></div>
      </app-modal>
    }

    @if (addOpen()) {
      <app-modal title="Add Requirement" [width]="460" (closed)="addOpen.set(false)">
        <label class="field-label-b">Requirement Type:</label>
        <select class="input mb-3" [(ngModel)]="reqType">@for (t of reqTypes; track t) { <option>{{ t }}</option> }</select>
        @if (reqType === 'Others') {
          <input class="input mb-3" [(ngModel)]="customType" maxlength="150" placeholder="e.g., 2x2 Picture, Medical Certificate, etc." />
        }
        <label class="field-label-b">Description:</label>
        <textarea class="input mb-3" rows="3" [(ngModel)]="reqDesc" maxlength="1000" placeholder="Enter description for this requirement"></textarea>
        <label class="field-label-b">Due Date:</label>
        <input class="input mb-4" type="date" [(ngModel)]="reqDue" />
        <div class="mt-5 flex justify-end gap-2"><button class="btn btn-gray" (click)="addOpen.set(false)">Cancel</button><button class="btn btn-brand" (click)="addReq()">Add requirement</button></div>
      </app-modal>
    }
  `,
})
export class ComplianceTab {
  private api = inject(Api);
  private dlg = inject(DialogService);
  /** Preselect a scholar (e.g. coming from the scholar form). */
  preselect = input<number | null>(null);

  options = signal<ComplianceScholarOption[]>([]);
  scholarId = signal(0);
  info = signal<ComplianceScholarInfo | null>(null);
  selected = signal<number | null>(null);
  statusOpen = signal(false);
  addOpen = signal(false);
  statuses = ['Pending', 'Submitted', 'Approved', 'Rejected', 'Overdue'];
  reqTypes = ['PSA Birth Certificate', 'Enrollment Form', 'COR', 'Grades', 'Scholarship Contract', 'Good Moral Certificate', 'Others'];
  newStatus = 'Pending'; remarks = '';
  reqType = this.reqTypes[0]; customType = ''; reqDesc = ''; reqDue = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  color = statusColor;

  constructor() {
    void this.loadOptions();
    effect(() => { const p = this.preselect(); if (p) untracked(() => void this.select(p)); });
  }

  sel(): ComplianceItem | null { return this.info()?.items.find((r) => r.id === this.selected()) ?? null; }

  private async loadOptions(): Promise<void> {
    try { this.options.set(await firstValueFrom(this.api.get<ComplianceScholarOption[]>('/admin/compliance/scholars'))); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  pickText = signal('');
  /** The row menu would be clipped by the scrolling table, so it is positioned against the viewport. */
  placeMenu(ev: Event): void {
    const d = ev.target as HTMLDetailsElement; if (!d.open) return;
    const menu = d.querySelector('div') as HTMLElement; const r = d.querySelector('summary')!.getBoundingClientRect();
    menu.style.position = 'fixed'; menu.style.top = r.bottom + 4 + 'px'; menu.style.left = Math.max(8, r.right - 190) + 'px'; menu.style.right = 'auto';
  }
  closeAll(): void { document.querySelectorAll('app-compliance-tab details[open]').forEach((d) => d.removeAttribute('open')); }
  closeMenu(ev: Event): void { (ev.target as HTMLElement).closest('details')?.removeAttribute('open'); }
  onPick(text: string): void {
    this.pickText.set(text);
    const t = text.trim().toLowerCase();
    const hit = this.options().find((o) => o.label.toLowerCase() === t);
    if (hit) void this.select(hit.id); else if (!t) void this.select(0);
  }

  async select(id: number): Promise<void> {
    this.scholarId.set(id || 0); this.selected.set(null);
    this.pickText.set(this.options().find((o) => o.id === id)?.label ?? '');
    if (!id) { this.info.set(null); return; }
    await this.reload();
  }

  private async reload(): Promise<void> {
    try { this.info.set(await firstValueFrom(this.api.get<ComplianceScholarInfo>(`/admin/scholars/${this.scholarId()}/compliance`))); }
    catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  private async run(action: () => Promise<unknown>, okMsg?: string): Promise<void> {
    try { await action(); await this.reload(); if (okMsg) void this.dlg.success(okMsg); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  async saveStatus(): Promise<void> {
    const r = this.sel(); if (!r) return;
    this.statusOpen.set(false);
    await this.run(() => firstValueFrom(this.api.put(`/admin/compliance/${r.id}/status`, { status: this.newStatus, remarks: this.remarks })), 'Compliance status updated successfully!');
  }
  openStatus(): void { const r = this.sel(); if (r) { this.newStatus = r.status; this.remarks = r.remarks ?? ''; } this.statusOpen.set(true); }

  async upload(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement; const file = input.files?.[0]; const r = this.sel();
    if (!file || !r) return;
    const fd = new FormData(); fd.append('file', file, file.name);
    await this.run(() => firstValueFrom(this.api.upload(`/admin/compliance/${r.id}/file`, fd)), 'File uploaded successfully!');
    input.value = '';
  }

  async view(): Promise<void> {
    const r = this.sel(); if (!r?.fileCount) return;
    try { await this.api.open(`/admin/compliance/${r.id}/file`); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  async deleteFile(): Promise<void> {
    const r = this.sel(); if (!r) return;
    if (!(await this.dlg.confirm('Delete the attached file? The requirement will go back to Pending.', 'Delete File'))) return;
    await this.run(() => firstValueFrom(this.api.delete(`/admin/compliance/${r.id}/file`)), 'File deleted.');
  }

  async markMissing(): Promise<void> {
    const r = this.sel(); if (!r) return;
    if (!(await this.dlg.confirm("Are you sure you want to mark this requirement as missing?\nThis will set the status to 'Overdue'.", 'Confirm Mark as Missing'))) return;
    await this.run(() => firstValueFrom(this.api.post(`/admin/compliance/${r.id}/mark-missing`)));
  }

  async remind(): Promise<void> {
    if (!(await this.dlg.confirm('Send reminder to this scholar for pending compliance requirements?', 'Send Reminder'))) return;
    await this.run(() => firstValueFrom(this.api.post(`/admin/scholars/${this.scholarId()}/compliance/remind`)), 'Reminder sent successfully!');
  }

  async addReq(): Promise<void> {
    const type = this.reqType === 'Others' ? this.customType.trim() : this.reqType;
    if (!type) { void this.dlg.warning('Please enter the requirement type.'); return; }
    if (!this.reqDue) { void this.dlg.warning('Please choose a due date.'); return; }
    this.addOpen.set(false);
    await this.run(() => firstValueFrom(this.api.post(`/admin/scholars/${this.scholarId()}/compliance`, { requirementType: type, description: this.reqDesc, dueDate: this.reqDue })), 'Requirement added successfully!');
    this.reqDesc = ''; this.customType = '';
  }

  async deleteReq(): Promise<void> {
    const r = this.sel(); if (!r) return;
    if (!(await this.dlg.confirm(`Delete requirement '${r.requirementType}' and its files?`, 'Delete Requirement'))) return;
    this.selected.set(null);
    await this.run(() => firstValueFrom(this.api.delete(`/admin/compliance/${r.id}`)), 'Requirement deleted.');
  }
}
