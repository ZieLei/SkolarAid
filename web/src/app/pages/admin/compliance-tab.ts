// =====================================================================
// compliance-tab.ts - the "Compliance Management" tab on the Scholars page.
//
// 0. On open (no scholar picked) it shows ALL scholars' requirements
//    -> loadAll() -> GET /api/admin/compliance (filter by status, search).
// 1. Admin picks a scholar -> select() -> GET /api/admin/scholars/{id}/compliance
// 2. Admin clicks a requirement row and uses its menu to:
// change status, upload / view / delete the file, mark as missing,
// delete the requirement.
// 3. Buttons above the table: add a requirement, send a reminder.
// After each action, run() reloads the list and shows a message.
// Live: reloads when this scholar's compliance changes (e.g. they uploaded a file).
// API: ComplianceController -> ComplianceService.
// =====================================================================
import { Component, computed, inject, input, signal, effect, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { filter, firstValueFrom } from 'rxjs';
import { RealtimeService, reloadOn } from '../../core/realtime';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, statusColor, RequirementNamePipe } from '../../core/format';
import { ComplianceItem, ComplianceOverviewItem, ComplianceScholarInfo, ComplianceScholarOption } from '../../core/models';

/** A table row: a requirement, plus whose it is when showing all scholars. */
type ComplianceRow = ComplianceItem & { scholarId?: number; scholarName?: string; scholarNumber?: string };
import { Modal } from '../../shared/modal';
import { AppIcon } from '../../shared/icon';
import { ScrollCue } from '../../shared/scroll-cue';

/** Compliance Management tab of Scholar Management. */
@Component({
  selector: 'app-compliance-tab',
  host: { '(document:click)': 'closeAll(); sugOpen.set(false)' },
  imports: [RequirementNamePipe, ScrollCue, FormsModule, Modal, DatePipeShort, AppIcon],
  template: `
    <div class="card mb-4 flex flex-wrap items-center gap-3 p-4">
      <label class="text-[13px] font-bold text-label" for="cs">Scholar:</label>
      <input id="cs" class="input !w-[360px]" list="scholar-options" placeholder="Type a name or scholar number…" autocomplete="off"
             [ngModel]="pickText()" (ngModelChange)="onPick($event)" aria-label="Scholar" />
      <datalist id="scholar-options">@for (s of options(); track s.id) { <option [value]="s.label"></option> }</datalist>
      @if (info(); as i) {
        <div class="ml-4 text-[13px]"><b class="text-brand">{{ i.fullName }}</b> · {{ i.scholarNumber }} · {{ i.course || '-' }} · {{ i.yearLevel || '-' }} · {{ i.scholarship || 'No scholarship' }}
          <span class="ml-2 rounded-full bg-[#f0f7f8] px-2 py-[2px] text-[12px] font-bold text-brand">{{ i.overall }}</span></div>
        <button class="btn btn-outline ml-auto !h-[32px]" (click)="select(0)">Show all scholars</button>
      } @else { <span class="text-[13px] text-muted">Showing every scholar's requirements. Pick a scholar to add requirements or send a reminder.</span> }
    </div>

      <div class="card p-4">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          @if (info()) {
            <button class="btn btn-brand" (click)="addOpen.set(true)">Add requirement</button>
            <button class="btn btn-outline" (click)="remind()">Remind scholar</button>
            <p class="ml-2 text-[13px] text-[#4b5563]">Use the buttons on each row to review, upload or view a document.</p>
          } @else {
            <label class="text-[13px] font-bold text-label" for="cs-status">Status:</label>
            <select id="cs-status" class="input !w-[160px]" [ngModel]="allStatus()" (ngModelChange)="allStatus.set($event); loadAll()"><option>All</option>@for (s of statuses; track s) { <option>{{ s }}</option> }</select>
            <div class="relative" (click)="$event.stopPropagation()">
              <input class="input !w-[280px]" placeholder="Search name, scholar # or requirement…" aria-label="Search requirements" autocomplete="off" role="combobox"
                     [attr.aria-expanded]="sugOpen() && suggestions().length > 0" aria-controls="cs-suggest" aria-autocomplete="list"
                     [ngModel]="allSearch()" (ngModelChange)="onAllSearch($event); sugOpen.set(true); sugIdx.set(-1)" (focus)="sugOpen.set(true)"
                     (keydown.arrowdown)="moveSug(1, $event)" (keydown.arrowup)="moveSug(-1, $event)" (keydown.enter)="pickActive($event)" (keydown.escape)="sugOpen.set(false)" />
              @if (sugOpen() && suggestions().length) {
                <ul id="cs-suggest" role="listbox" class="absolute left-0 top-[calc(100%+6px)] z-30 max-h-[300px] w-[340px] max-w-[85vw] overflow-auto rounded-xl border border-line bg-white p-1.5 shadow-xl ring-1 ring-black/5">
                  @for (s of suggestions(); track s.kind + s.value; let i = $index) {
                    <li role="option" [attr.aria-selected]="i === sugIdx()" class="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px]" [class.bg-brand-soft]="i === sugIdx()"
                        (mouseenter)="sugIdx.set(i)" (mousedown)="$event.preventDefault()" (click)="pickSug(s)">
                      <span class="shrink-0 rounded-full bg-[#eef3f4] px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-[#3d5359]">{{ s.kind }}</span>
                      <span class="min-w-0 flex-1 truncate font-medium text-ink">{{ s.label }}</span>
                      @if (s.sub) { <span class="shrink-0 text-[12px] text-muted">{{ s.sub }}</span> }
                    </li>
                  }
                </ul>
              }
            </div>
            <p class="ml-2 text-[13px] text-[#4b5563]"><b>{{ rows().length }}</b> requirement{{ rows().length === 1 ? '' : 's' }} · waiting for review first</p>
          }
        </div>
        <!-- Where things stand: how many are approved, and how many are waiting on the admin. -->
        <div class="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-[#f4f7f8] px-4 py-3">
          <div class="min-w-[200px] flex-1">
            <p class="text-[13px] font-semibold text-ink"><b class="text-[#17692c]">{{ progress().approved }}</b> of {{ progress().total }} approved</p>
            <div class="mt-1.5 h-[8px] overflow-hidden rounded-full bg-[#dfe7e9]" role="progressbar" [attr.aria-valuenow]="progress().pct" aria-valuemin="0" aria-valuemax="100" aria-label="Requirements approved"><div class="h-full rounded-full bg-ok transition-all duration-500" [style.width.%]="progress().pct"></div></div>
          </div>
          @if (progress().review) { <p class="flex items-center gap-1.5 text-[13px] font-semibold text-[#0b5cad]"><span class="h-2 w-2 animate-pulse rounded-full bg-[#0b5cad]"></span>{{ progress().review }} waiting for your review</p> }
          @if (progress().waiting) { <p class="text-[13px] text-muted">{{ progress().waiting }} waiting for an upload</p> }
        </div>
        <div scrollCue class="grid-wrap max-h-[560px] rounded-xl border border-line">
          <table class="dgrid">
            <thead><tr>@if (!info()) { <th>Scholar</th> }<th>Requirement</th><th>Description</th><th>Due Date</th><th>Submitted</th><th>Status</th><th>File</th><th>Remarks</th><th>Actions</th></tr></thead>
            <tbody>
              @for (r of rows(); track r.id; let k = $index) {
                <tr [class.alt]="k % 2 === 1" [class.appr]="r.status === 'Approved'" [class.sel]="sel()?.id === r.id" (click)="selected.set(r.id)" (dblclick)="view()" class="cursor-pointer">
                  @if (!info()) { <td class="wrap"><button class="font-bold text-brand underline" (click)="$event.stopPropagation(); select(r.scholarId!)" [title]="'Open ' + r.scholarName">{{ r.scholarName }}</button><div class="text-[12px] text-muted">{{ r.scholarNumber }}</div></td> }
                  <td class="wrap font-bold">{{ r.requirementType | reqName }}</td><td class="wrap">{{ r.description }}</td>
                  <td>{{ r.dueDate | dmy }}</td><td>{{ r.dateSubmitted | dmy: '—' }}</td>
                  <td>
                    <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold" [class]="sv(r).cls"><app-icon [name]="sv(r).icon" class="h-4 w-4"></app-icon>{{ sv(r).label }}</span>
                    <div class="mt-1 text-[11px] text-muted">{{ sv(r).sub }}</div>
                  </td>
                  <td class="wrap">{{ r.fileCount ? (r.fileName || r.fileCount) : '—' }}</td><td class="wrap">{{ r.remarks || '—' }}</td>
                  <td class="whitespace-nowrap">
                    <div class="flex items-center gap-1">
                      <!-- One obvious next step per row, based on where the requirement is in its life. -->
                      @switch (r.status) {
                        @case ('Submitted') {
                          <button class="btn btn-brand !h-[30px] !px-3 !text-[12px]" (click)="$event.stopPropagation(); selected.set(r.id); openStatus()"><app-icon name="checked" class="h-4 w-4"></app-icon>Review</button>
                        }
                        @case ('Approved') { }
                        @default {
                          <label class="btn btn-brand !h-[30px] !px-3 !text-[12px]" (click)="$event.stopPropagation(); selected.set(r.id)"><app-icon name="attachment" class="h-4 w-4"></app-icon>{{ r.status === 'Rejected' ? 'Upload new file' : 'Upload file' }}<input type="file" class="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" (change)="upload($event)" /></label>
                        }
                      }
                      @if (r.fileCount) { <button class="btn btn-outline !h-[30px] !px-3 !text-[12px]" (click)="$event.stopPropagation(); selected.set(r.id); view()">View file</button> }
                      <details class="relative" (click)="$event.stopPropagation()" (toggle)="placeMenu($event)">
                        <summary class="btn btn-outline !h-[30px] !px-3 !text-[12px] cursor-pointer list-none" aria-label="More actions">More</summary>
                        <div class="absolute right-0 z-10 mt-1 w-[190px] rounded-lg border border-[#d4d4d4] bg-white py-1 text-left shadow-lg">
                          <button class="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#f3f4f6]" (click)="closeMenu($event); selected.set(r.id); openStatus()">{{ r.status === 'Approved' ? 'Re-review / change status' : 'Change status…' }}</button>
                          @if (r.fileCount && r.status !== 'Submitted') { <label class="block w-full cursor-pointer px-3 py-2 text-left text-[13px] hover:bg-[#f3f4f6]" (click)="selected.set(r.id)">Replace file<input type="file" class="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" (change)="upload($event)" /></label> }
                          @if (r.status !== 'Overdue') { <button class="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#f3f4f6]" (click)="closeMenu($event); selected.set(r.id); markMissing()">Mark as missing</button> }
                          @if (r.fileCount) { <button class="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#f3f4f6]" (click)="closeMenu($event); selected.set(r.id); deleteFile()">Delete attached file</button> }
                          <button class="block w-full px-3 py-2 text-left text-[13px] font-bold text-[#b42318] hover:bg-[#fdecea]" (click)="closeMenu($event); selected.set(r.id); deleteReq()">Delete requirement</button>
                        </div>
                      </details>
                    </div>
                  </td>
                </tr>
              } @empty { <tr><td [attr.colspan]="info() ? 8 : 9" class="!py-6 text-center text-[#595959]">No requirements</td></tr> }
            </tbody>
          </table>
        </div>
      </div>

    @if (statusOpen()) {
      <app-modal title="Review requirement" [width]="520" (closed)="statusOpen.set(false)">
        @if (sel(); as r) {
          <div class="mb-4 rounded-xl bg-[#f4f7f8] p-4">
            <p class="text-[15px] font-semibold text-ink">{{ r.requirementType | reqName }}</p>
            @if (r.scholarName) { <p class="text-[12px] text-muted">{{ r.scholarName }} · {{ r.scholarNumber }}</p> }
            <div class="mt-3 flex flex-wrap items-center gap-2">
              @if (r.fileCount) {
                <span class="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] ring-1 ring-line"><app-icon name="attachment" class="h-4 w-4 shrink-0 text-brand"></app-icon><span class="truncate">{{ r.fileName || 'Attached file' }}</span></span>
                <button class="btn btn-outline !h-[32px] !text-[12px]" (click)="view()">Open file to check it</button>
              } @else { <p class="flex items-center gap-1.5 text-[12px] font-semibold text-[#8a5300]"><app-icon name="alert" class="h-4 w-4"></app-icon>No file has been uploaded for this yet.</p> }
            </div>
          </div>
          <p class="field-label-b">Your decision</p>
          <div class="mb-3 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Decision">
            <button type="button" role="radio" [attr.aria-checked]="newStatus === 'Approved'" class="flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-[14px] font-semibold transition"
                    [class]="newStatus === 'Approved' ? 'border-ok bg-[#e3f4e7] text-[#17692c]' : 'border-line bg-white text-label hover:bg-[#f4f7f8]'" (click)="newStatus = 'Approved'">
              <app-icon name="checked" class="h-6 w-6"></app-icon>Approve<span class="text-[11px] font-normal">The document is correct</span></button>
            <button type="button" role="radio" [attr.aria-checked]="newStatus === 'Rejected'" class="flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-[14px] font-semibold transition"
                    [class]="newStatus === 'Rejected' ? 'border-danger bg-[#fdecea] text-[#b42318]' : 'border-line bg-white text-label hover:bg-[#f4f7f8]'" (click)="newStatus = 'Rejected'">
              <app-icon name="reject" class="h-6 w-6"></app-icon>Reject<span class="text-[11px] font-normal">Scholar must upload again</span></button>
          </div>
          <label class="field-label-b" for="rv-remarks">Remarks @if (newStatus === 'Rejected') { <span class="text-danger">(required: tell the scholar what is wrong)</span> } @else { <span class="font-normal text-muted">(optional)</span> }</label>
          <textarea id="rv-remarks" class="input mb-3" rows="3" [(ngModel)]="remarks" maxlength="1000"></textarea>
          <details class="mb-1 text-[12px] text-muted"><summary class="cursor-pointer">Set a different status</summary>
            <select class="input mt-2" [(ngModel)]="newStatus">@for (s of statuses; track s) { <option>{{ s }}</option> }</select></details>
          <div class="mt-5 flex justify-end gap-2">
            <button class="btn btn-gray" (click)="statusOpen.set(false)">Cancel</button>
            <button class="btn" [class]="newStatus === 'Rejected' ? 'btn-danger' : newStatus === 'Approved' ? 'btn-ok' : 'btn-brand'" (click)="saveStatus()">{{ newStatus === 'Approved' ? 'Approve requirement' : newStatus === 'Rejected' ? 'Reject requirement' : 'Save status' }}</button>
          </div>
        }
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
  /** How a requirement's status looks: a badge plus one line saying what happens next. */
  sv(r: ComplianceRow): { label: string; sub: string; icon: string; cls: string } {
    switch (r.status) {
      case 'Submitted': return { label: 'Needs review', sub: 'File uploaded, waiting for you', icon: 'info', cls: 'bg-[#e4f0fb] text-[#0b5cad]' };
      case 'Approved': return { label: 'Approved', sub: r.checkedBy ? 'by ' + r.checkedBy : 'Requirement complete', icon: 'checked', cls: 'bg-[#e3f4e7] text-[#17692c]' };
      case 'Rejected': return { label: 'Rejected', sub: 'Waiting for a new file', icon: 'reject', cls: 'bg-[#fdecea] text-[#b42318]' };
      case 'Overdue': return { label: 'Overdue', sub: 'Past due, no approved file', icon: 'overdue', cls: 'bg-[#fdecea] text-[#b42318]' };
      default: return { label: 'Awaiting upload', sub: 'No file yet', icon: 'wall-clock', cls: 'bg-[#fff4e0] text-[#8a5300]' };
    }
  }
  progress = computed(() => {
    const rs = this.rows(); const approved = rs.filter((r) => r.status === 'Approved').length;
    return { total: rs.length, approved, pct: rs.length ? Math.round((approved / rs.length) * 100) : 0,
      review: rs.filter((r) => r.status === 'Submitted').length, waiting: rs.filter((r) => r.status === 'Pending' || r.status === 'Rejected' || r.status === 'Overdue').length };
  });

  // Load the scholar drop-down, listen for live updates, and open the
  // preselected scholar if the Scholars page passed one in.
  // "Show all" mode (no scholar picked): every scholar's requirements, with a status filter and search.
  all = signal<ComplianceOverviewItem[]>([]);
  allStatus = signal('All'); allSearch = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  // The rows the table shows: the picked scholar's requirements, or everyone's.
  rows = computed<ComplianceRow[]>(() => this.info()?.items ?? this.all());

  constructor() {
    void this.loadOptions();
    void this.loadAll();
    // A scholar uploaded a document, or another admin changed requirements:
    // reload when it is the open scholar, or anyone while showing all.
    const rt = inject(RealtimeService);
    reloadOn([rt.complianceChanged$.pipe(filter((c) => !this.scholarId() || c.scholarId === this.scholarId()))], () => this.reload());
    effect(() => { const p = this.preselect(); if (p) untracked(() => void this.select(p)); });
  }

  // The requirement row the admin clicked (or null).
  sel(): ComplianceRow | null { return this.rows().find((r) => r.id === this.selected()) ?? null; }

  // GET /api/admin/compliance - everyone's requirements (things to review first).
  async loadAll(): Promise<void> {
    try { this.all.set(await firstValueFrom(this.api.get<ComplianceOverviewItem[]>('/admin/compliance', { status: this.allStatus(), search: this.allSearch() }))); }
    catch (e) { void this.dlg.error(errorMessage(e)); }
  }
  // Search suggestions: scholars (name / number) and requirement types that match what is typed.
  sugOpen = signal(false); sugIdx = signal(-1);
  suggestions = computed(() => {
    const q = this.allSearch().trim().toLowerCase();
    const reqs = this.reqTypes.filter((r) => r !== 'Others' && (!q || r.toLowerCase().includes(q))).map((r) => ({ kind: 'Requirement', label: r, value: r, sub: '' }));
    if (!q) return reqs.slice(0, 6);
    const people = this.options().filter((o) => o.label.toLowerCase().includes(q)).slice(0, 6).map((o) => {
      const m = /^(.*) \(([^)]*)\)$/.exec(o.label);
      return { kind: 'Scholar', label: m ? m[1] : o.label, value: m ? m[2] : o.label, sub: m ? m[2] : '' };
    });
    return [...people, ...reqs.slice(0, 3)].filter((s) => s.value.toLowerCase() !== q);
  });
  moveSug(d: number, ev: Event): void {
    const n = this.suggestions().length; if (!n) return;
    ev.preventDefault(); this.sugOpen.set(true); this.sugIdx.set((this.sugIdx() + d + n) % n);
  }
  pickActive(ev: Event): void { const s = this.suggestions()[this.sugIdx()]; if (this.sugOpen() && s) { ev.preventDefault(); this.pickSug(s); } }
  pickSug(s: { value: string }): void { this.allSearch.set(s.value); this.sugOpen.set(false); this.sugIdx.set(-1); clearTimeout(this.searchTimer); void this.loadAll(); }

  // Wait until typing stops for 300 ms before searching.
  onAllSearch(v: string): void { this.allSearch.set(v); clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => void this.loadAll(), 300); }

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
  // Typing in the scholar picker: when the text matches a scholar exactly, open them.
  onPick(text: string): void {
    this.pickText.set(text);
    const t = text.trim().toLowerCase();
    const hit = this.options().find((o) => o.label.toLowerCase() === t);
    if (hit) void this.select(hit.id); else if (!t) void this.select(0);
  }

  // Open one scholar's compliance list (id 0 = nothing selected).
  async select(id: number): Promise<void> {
    this.scholarId.set(id || 0); this.selected.set(null);
    this.pickText.set(this.options().find((o) => o.id === id)?.label ?? '');
    if (!id) { this.info.set(null); await this.loadAll(); return; }
    await this.reload();
  }

  // Reload whatever is on screen: the picked scholar, or the "show all" list.
  private async reload(): Promise<void> {
    if (!this.scholarId()) { await this.loadAll(); return; }
    try { this.info.set(await firstValueFrom(this.api.get<ComplianceScholarInfo>(`/admin/scholars/${this.scholarId()}/compliance`))); }
    catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  // Shared helper: do the action, reload the list, show success or error.
  private async run(action: () => Promise<unknown>, okMsg?: string): Promise<void> {
    try { await action(); await this.reload(); if (okMsg) void this.dlg.success(okMsg); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  // Save the status chosen in the "Change status" pop-up.
  async saveStatus(): Promise<void> {
    const r = this.sel(); if (!r) return;
    if (this.newStatus === 'Rejected' && !this.remarks.trim()) { void this.dlg.warning('Please tell the scholar why it was rejected in the remarks.'); return; }
    this.statusOpen.set(false);
    await this.run(() => firstValueFrom(this.api.put(`/admin/compliance/${r.id}/status`, { status: this.newStatus, remarks: this.remarks })), this.newStatus === 'Approved' ? 'Requirement approved.' : this.newStatus === 'Rejected' ? 'Requirement rejected. The scholar can upload a new file.' : 'Status updated.');
  }
  // Open the "Change status" pop-up, filled with the row's current values.
  openStatus(): void { const r = this.sel(); if (r) { this.newStatus = r.status === 'Submitted' ? 'Approved' : r.status; this.remarks = r.status === 'Rejected' || r.status === 'Approved' ? r.remarks ?? '' : ''; } this.statusOpen.set(true); }

  // Upload a file for the selected requirement (it becomes Submitted).
  async upload(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement; const file = input.files?.[0]; const r = this.sel();
    if (!file || !r) return;
    const fd = new FormData(); fd.append('file', file, file.name);
    await this.run(() => firstValueFrom(this.api.upload(`/admin/compliance/${r.id}/file`, fd)), 'File uploaded successfully!');
    input.value = '';
  }

  // Open the selected requirement's file in a new tab.
  async view(): Promise<void> {
    const r = this.sel(); if (!r?.fileCount) return;
    try { await this.api.open(`/admin/compliance/${r.id}/file`); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  // Delete the file; the requirement goes back to Pending.
  async deleteFile(): Promise<void> {
    const r = this.sel(); if (!r) return;
    if (!(await this.dlg.confirm('Delete the attached file? The requirement will go back to Pending.', 'Delete File'))) return;
    await this.run(() => firstValueFrom(this.api.delete(`/admin/compliance/${r.id}/file`)), 'File deleted.');
  }

  // Set the requirement to Overdue.
  async markMissing(): Promise<void> {
    const r = this.sel(); if (!r) return;
    if (!(await this.dlg.confirm("Are you sure you want to mark this requirement as missing?\nThis will set the status to 'Overdue'.", 'Confirm Mark as Missing'))) return;
    await this.run(() => firstValueFrom(this.api.post(`/admin/compliance/${r.id}/mark-missing`)), 'Requirement marked as missing (Overdue).');
  }

  // Send this scholar an in-app reminder about missing documents.
  async remind(): Promise<void> {
    if (!(await this.dlg.confirm('Send reminder to this scholar for pending compliance requirements?', 'Send Reminder'))) return;
    await this.run(() => firstValueFrom(this.api.post(`/admin/scholars/${this.scholarId()}/compliance/remind`)), 'Reminder sent successfully!');
  }

  // Add a new requirement. "Others" lets the admin type their own name.
  async addReq(): Promise<void> {
    const type = this.reqType === 'Others' ? this.customType.trim() : this.reqType;
    if (!type) { void this.dlg.warning('Please enter the requirement type.'); return; }
    if (!this.reqDue) { void this.dlg.warning('Please choose a due date.'); return; }
    this.addOpen.set(false);
    await this.run(() => firstValueFrom(this.api.post(`/admin/scholars/${this.scholarId()}/compliance`, { requirementType: type, description: this.reqDesc, dueDate: this.reqDue })), 'Requirement added successfully!');
    this.reqDesc = ''; this.customType = '';
  }

  // Delete the requirement and its files.
  async deleteReq(): Promise<void> {
    const r = this.sel(); if (!r) return;
    if (!(await this.dlg.confirm(`Delete requirement '${r.requirementType}' and its files?`, 'Delete Requirement'))) return;
    this.selected.set(null);
    await this.run(() => firstValueFrom(this.api.delete(`/admin/compliance/${r.id}`)), 'Requirement deleted.');
  }
}
