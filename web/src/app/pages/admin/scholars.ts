import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, PesoPipe, dateInput, statusColor } from '../../core/format';
import { ComplianceItem, Paged, ScholarCreated, ScholarDetail, ScholarFilters, ScholarListItem, ScholarSave, ScholarshipType } from '../../core/models';
import { Modal } from '../../shared/modal';
import { COURSES, GENDERS, YEAR_LEVELS } from '../register';
import { ComplianceTab } from './compliance-tab';
import { ScholarshipTypesDialog } from './scholarship-types';

const DOCS = [
  { key: 'PSA', label: 'PSA Birth Certificate' }, { key: 'COE', label: 'COE (current sem)' }, { key: 'COR', label: 'COR' },
  { key: 'Grades', label: 'Latest Grades' }, { key: 'Contract', label: 'Scholarship Contract' },
];
const STATUSES = ['Active', 'Inactive', 'Probation', 'Suspended', 'Graduated', 'Terminated', 'Withdrawn', 'Expelled', 'Completed', 'Dropped'];
const FREQS = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual'];
const FUND_SOURCES = ['Government', 'Private', 'Alumni', 'Corporate', 'Others'];

interface Form {
  studentId: string; firstName: string; middleName: string; lastName: string; suffix: string; email: string; contactNumber: string;
  dateOfBirth: string; gender: string; address: string; course: string; yearLevel: string; scholarshipTypeId: number; stipendAmount: number;
  stipendFrequency: string; scholarshipFundSource: string; renewalConditions: string; bankName: string; bankAccountNumber: string;
  enrollmentDate: string; expectedGraduation: string; status: string; scholarNumber: string;
}
const blank = (): Form => ({
  studentId: '', firstName: '', middleName: '', lastName: '', suffix: '', email: '', contactNumber: '', dateOfBirth: '', gender: 'Male', address: '', course: '',
  yearLevel: '', scholarshipTypeId: 0, stipendAmount: 0, stipendFrequency: 'Monthly', scholarshipFundSource: 'Government', renewalConditions: '', bankName: '',
  bankAccountNumber: '', enrollmentDate: '', expectedGraduation: '', status: 'Active', scholarNumber: '',
});

@Component({
  selector: 'app-scholars',
  imports: [FormsModule, Modal, PesoPipe, DatePipeShort, ComplianceTab, ScholarshipTypesDialog],
  template: `
    <h1 class="page-title mb-4">Scholar Management</h1>

    <div class="mb-4 flex gap-1 border-b-2 border-[#d9d9d9]">
      @for (t of tabs; track t.id) {
        <button class="rounded-t-lg px-5 py-2 text-[14px] font-bold" [class.bg-brand]="tab() === t.id" [class.text-white]="tab() === t.id" [class.text-label]="tab() !== t.id"
                (click)="tab.set(t.id)">{{ t.label }}</button>
      }
    </div>

    @if (tab() === 'compliance') {
      <app-compliance-tab [preselect]="complianceFor()" />
    } @else {
      <div class="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <button class="btn btn-brand !h-[35px] !px-4" (click)="typesOpen.set(true)">View Scholarships Management</button>
        <div class="relative min-w-[240px] flex-1">
          <span class="absolute left-2 top-[6px] text-[13px] text-muted">🔍</span>
          <input class="input !pl-8" placeholder="Search scholar..." [ngModel]="search()" (ngModelChange)="onSearch($event)" aria-label="Search scholar" />
        </div>
        <span class="text-[13px] font-bold text-label">Filter:</span>
        <select class="input !w-[170px]" [ngModel]="filterType()" (ngModelChange)="filterType.set($event); loadList()" aria-label="Scholarship filter">
          <option [ngValue]="0">All Scholarships</option>@for (o of filters()?.scholarships ?? []; track o.id) { <option [ngValue]="o.id">{{ o.name }}</option> }
        </select>
        <select class="input !w-[130px]" [ngModel]="filterStatus()" (ngModelChange)="filterStatus.set($event); loadList()" aria-label="Status filter">
          <option>All</option>@for (s of statuses; track s) { <option>{{ s }}</option> }
        </select>
      </div>

      <div class="grid gap-4 2xl:grid-cols-[1fr_569px]">
        <section class="card overflow-hidden">
          <div class="grid-wrap max-h-[720px]">
            <table class="grid">
              <thead><tr><th>ID</th><th>Scholar #</th><th>Student ID</th><th>Full Name</th><th>Course</th><th>Year</th><th>Scholarship</th><th>Status</th></tr></thead>
              <tbody>
                @for (s of list(); track s.id; let i = $index) {
                  <tr class="cursor-pointer" [class.alt]="i % 2 === 1" [class.sel]="s.id === selectedId()" (click)="select(s.id)" (dblclick)="openDetails(s.id)">
                    <td>{{ s.id }}</td><td>{{ s.scholarNumber }}</td><td>{{ s.studentId }}</td><td class="font-bold">{{ s.fullName }}</td>
                    <td class="max-w-[260px] truncate" [title]="s.course ?? ''">{{ s.course }}</td><td>{{ s.yearLevel }}</td><td>{{ s.scholarship }}</td>
                    <td><span class="font-bold" [style.color]="color(s.status)">{{ s.status }}</span></td>
                  </tr>
                } @empty { <tr><td colspan="8" class="!py-8 text-center text-[#969696]">No scholars found</td></tr> }
              </tbody>
            </table>
          </div>
          <p class="px-3 py-2 text-[12px] text-muted">Showing {{ list().length }} of {{ total() }} scholars</p>
        </section>

        <section class="card p-4">
          <h2 class="mb-1 text-[18px] font-bold text-brand">{{ selectedId() ? 'Scholar Information/Editing Scholar' : 'Scholar Information/Adding Scholar' }}</h2>

          <h3 class="section-title">Basic Information</h3>
          <div class="grid grid-cols-3 gap-x-3 gap-y-2">
            <div><label class="field-label">First Name</label><input class="input" [(ngModel)]="f.firstName" maxlength="100" /></div>
            <div><label class="field-label">Last Name</label><input class="input" [(ngModel)]="f.lastName" maxlength="100" /></div>
            <div><label class="field-label">Middle Name</label><input class="input" [(ngModel)]="f.middleName" maxlength="100" /></div>
            <div class="col-span-2"><label class="field-label">Email</label><input class="input" type="email" [(ngModel)]="f.email" maxlength="150" /></div>
            <div><label class="field-label">Contact Number</label><input class="input" [(ngModel)]="f.contactNumber" maxlength="30" /></div>
            <div><label class="field-label">Date of Birth</label><input class="input" type="date" [(ngModel)]="f.dateOfBirth" /></div>
            <div><label class="field-label">Gender</label><select class="input" [(ngModel)]="f.gender">@for (g of genders; track g) { <option>{{ g }}</option> }</select></div>
            @if (!selectedId()) { <div><label class="field-label">Suffixes</label><input class="input" [(ngModel)]="f.suffix" maxlength="30" /></div> } @else { <div></div> }
            <div class="col-span-2"><label class="field-label">Address</label><input class="input" [(ngModel)]="f.address" maxlength="500" /></div>
            <div><label class="field-label">Student ID #</label><input class="input" [(ngModel)]="f.studentId" maxlength="50" placeholder="auto if blank" /></div>
          </div>

          <h3 class="section-title">Academic Details</h3>
          <div class="grid grid-cols-[1fr_90px] gap-x-3">
            <div><label class="field-label">Course</label><select class="input" [(ngModel)]="f.course"><option value="">Select...</option>@for (c of courses; track c) { <option>{{ c }}</option> }</select></div>
            <div><label class="field-label">Year Level</label><select class="input" [(ngModel)]="f.yearLevel"><option value="">-</option>@for (y of years; track y) { <option>{{ y }}</option> }</select></div>
          </div>

          <h3 class="section-title">Scholarship Details</h3>
          <div class="grid grid-cols-2 gap-x-3 gap-y-2">
            <div><label class="field-label">Scholarship Type</label>
              <select class="input" [ngModel]="f.scholarshipTypeId" (ngModelChange)="onTypeChange($event)"><option [ngValue]="0">Select...</option>@for (t of types(); track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }</select></div>
            <div><label class="field-label">Stipend Amount</label><input class="input" type="number" min="0" step="0.01" [(ngModel)]="f.stipendAmount" /></div>
            <div><label class="field-label">Stipend Frequency</label><select class="input" [(ngModel)]="f.stipendFrequency">@for (x of freqs; track x) { <option>{{ x }}</option> }</select></div>
            <div><label class="field-label">Scholarship Fund Source</label><select class="input" [(ngModel)]="f.scholarshipFundSource">@for (x of funds; track x) { <option>{{ x }}</option> }</select></div>
            <div class="col-span-2"><label class="field-label">Renewal Conditions</label><input class="input" [(ngModel)]="f.renewalConditions" maxlength="1000" /></div>
          </div>

          <h3 class="section-title">Bank Information</h3>
          <div class="grid grid-cols-[1.5fr_1fr] gap-x-3 gap-y-2">
            <div><label class="field-label">Bank Name</label><input class="input" [(ngModel)]="f.bankName" maxlength="100" /></div>
            <div><label class="field-label">Account Number</label><input class="input" [(ngModel)]="f.bankAccountNumber" maxlength="50" /></div>
            <div><label class="field-label">Enrollment Date</label><input class="input" type="date" [(ngModel)]="f.enrollmentDate" /></div>
            <div><label class="field-label">Expected Graduation</label><input class="input" type="date" [(ngModel)]="f.expectedGraduation" /></div>
            <div><label class="field-label">Status</label><select class="input" [(ngModel)]="f.status" [disabled]="!selectedId()">@for (s of statuses; track s) { <option>{{ s }}</option> }</select></div>
            <div><label class="field-label">Scholar Number</label><input class="input" [value]="f.scholarNumber || 'Generated on save'" disabled /></div>
          </div>

          <h3 class="section-title">Files Attachments</h3>
          <div class="grid grid-cols-3 gap-x-3 gap-y-2">
            @for (d of docs; track d.key) {
              <div>
                <label class="field-label">{{ d.label }}</label>
                @if (!selectedId()) {
                  <label class="input flex cursor-pointer items-center truncate !text-[12px]" [class.!text-ok]="!!pending[d.key]">
                    {{ pending[d.key] ? '✓ ' + pending[d.key]!.name : 'ATTACH FILE' }}
                    <input type="file" class="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" (change)="pickPending(d.key, $event)" />
                  </label>
                } @else {
                  @let doc = docFor(d.key);
                  @if (doc; as dc) {
                    <div class="flex gap-1">
                      <button type="button" class="input !text-left !text-[12px]" [disabled]="!dc.hasFile" (click)="openDoc(dc.complianceId)">{{ dc.hasFile ? '📎 ' + dc.fileName : 'TBA' }}</button>
                      <label class="btn btn-info !h-[30px] !px-2 !text-[11px]">↑<input type="file" class="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" (change)="replaceDoc(dc.complianceId, $event)" /></label>
                    </div>
                  } @else { <span class="text-[12px] text-muted">TBA</span> }
                }
              </div>
            }
          </div>

          <div class="mt-5 flex flex-wrap gap-2">
            @if (!selectedId()) {
              <button class="btn btn-brand" [disabled]="busy()" (click)="save()">Add Scholar</button>
            } @else {
              <button class="btn btn-info" (click)="openDetails(selectedId()!)">View</button>
              <button class="btn btn-warn" [disabled]="busy()" (click)="save()">Update</button>
              <button class="btn" style="background:#ffaa00" (click)="toggleStatus()">{{ f.status === 'Active' ? 'Deactivate' : 'Reactivate' }}</button>
              <button class="btn btn-accent" (click)="complianceFor.set(selectedId()); tab.set('compliance')">Compliance</button>
            }
            <button class="btn btn-gray" (click)="clear()">Clear Fields</button>
          </div>
        </section>
      </div>
    }

    @if (typesOpen()) { <app-scholarship-types (closed)="typesOpen.set(false)" (changed)="loadTypes()" /> }

    @if (created(); as c) {
      <app-modal title="Scholar added successfully" [width]="480" (closed)="created.set(null)">
        <p class="mb-3 text-[14px]">✅ <b>{{ c.fullName }}</b> has been added.</p>
        <dl class="grid grid-cols-[130px_1fr] gap-y-1 text-[14px]">
          <dt class="text-muted">Scholar Number</dt><dd class="font-bold">{{ c.scholarNumber }}</dd>
          <dt class="text-muted">Student ID / Username</dt><dd class="font-bold">{{ c.username }}</dd>
          <dt class="text-muted">Temporary Password</dt><dd class="font-mono font-bold">{{ c.temporaryPassword }}</dd>
          <dt class="text-muted">Email</dt><dd>{{ c.email }} {{ c.emailSent ? '(sent)' : '(not sent)' }}</dd>
          <dt class="text-muted">SMS</dt><dd>{{ c.smsSent ? 'sent' : 'not sent' }}</dd>
        </dl>
        <p class="mt-3 rounded bg-[#fff8e1] p-2 text-[12px] text-[#7a5b00]">Copy the password now — it is stored only as a hash and cannot be shown again.</p>
        <button class="btn btn-brand mt-4 w-full" (click)="created.set(null)">Done</button>
      </app-modal>
    }

    @if (details(); as d) {
      <app-modal [title]="d.firstName + ' ' + d.lastName" [width]="860" (closed)="details.set(null)">
        <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-lg bg-[#f0f7f8] p-3"><p class="text-[12px] text-muted">Scholar #</p><p class="font-bold text-brand">{{ d.scholarNumber }}</p></div>
          <div class="rounded-lg bg-[#f0f7f8] p-3"><p class="text-[12px] text-muted">Total Received</p><p class="font-bold text-brand">{{ d.totalReceived | peso }}</p></div>
          <div class="rounded-lg bg-[#f0f7f8] p-3"><p class="text-[12px] text-muted">Payments</p><p class="font-bold text-brand">{{ d.paymentCount }}</p></div>
          <div class="rounded-lg bg-[#f0f7f8] p-3"><p class="text-[12px] text-muted">Compliance</p><p class="font-bold text-brand">{{ d.approvedCompliance }}/{{ d.totalCompliance }} approved</p></div>
        </div>
        <dl class="grid grid-cols-[150px_1fr_150px_1fr] gap-y-1 text-[13px]">
          <dt class="text-muted">Student ID</dt><dd>{{ d.studentId }}</dd><dt class="text-muted">Status</dt><dd class="font-bold" [style.color]="color(d.status)">{{ d.status }}</dd>
          <dt class="text-muted">Email</dt><dd>{{ d.email }}</dd><dt class="text-muted">Contact</dt><dd>{{ d.contactNumber }}</dd>
          <dt class="text-muted">Course</dt><dd class="col-span-3">{{ d.course }} — {{ d.yearLevel }}</dd>
          <dt class="text-muted">Scholarship</dt><dd>{{ d.scholarshipName }}</dd><dt class="text-muted">Stipend</dt><dd>{{ d.stipendAmount | peso }} / {{ d.stipendFrequency }}</dd>
          <dt class="text-muted">Bank</dt><dd>{{ d.bankName }} {{ d.bankAccountNumber }}</dd><dt class="text-muted">Enrolled</dt><dd>{{ d.enrollmentDate | dmy }}</dd>
          <dt class="text-muted">Birth Date</dt><dd>{{ d.dateOfBirth | dmy }}</dd><dt class="text-muted">Expected Graduation</dt><dd>{{ d.expectedGraduation | dmy }}</dd>
          <dt class="text-muted">Address</dt><dd class="col-span-3">{{ d.address }}</dd>
        </dl>
        <h3 class="section-title mt-4">Compliance Documents</h3>
        <div class="grid-wrap rounded border border-[#e6e6e6]">
          <table class="grid"><thead><tr><th>Requirement</th><th>Description</th><th>Status</th><th>Due</th><th>Files</th></tr></thead>
            <tbody>@for (r of detailItems(); track r.id; let i = $index) {
              <tr [class.alt]="i % 2 === 1"><td class="font-bold">{{ r.requirementType }}</td><td>{{ r.description }}</td>
                <td><span class="font-bold" [style.color]="color(r.status)">{{ r.status }}</span></td><td>{{ r.dueDate | dmy }}</td><td>{{ r.fileCount }}</td></tr>
            }</tbody></table>
        </div>
      </app-modal>
    }
  `,
})
export class ScholarsPage implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  tabs = [{ id: 'info', label: 'Scholar Information' }, { id: 'compliance', label: 'Compliance Management' }] as const;
  tab = signal<'info' | 'compliance'>('info');
  list = signal<ScholarListItem[]>([]);
  total = signal(0);
  filters = signal<ScholarFilters | null>(null);
  types = signal<ScholarshipType[]>([]);
  search = signal(''); filterType = signal(0); filterStatus = signal('All');
  selectedId = signal<number | null>(null);
  complianceFor = signal<number | null>(null);
  detail = signal<ScholarDetail | null>(null);
  busy = signal(false);
  typesOpen = signal(false);
  created = signal<ScholarCreated | null>(null);
  details = signal<ScholarDetail | null>(null);
  detailItems = signal<ComplianceItem[]>([]);
  f: Form = blank();
  pending: Record<string, File | undefined> = {};
  docs = DOCS; statuses = STATUSES; freqs = FREQS; funds = FUND_SOURCES; courses = COURSES; years = YEAR_LEVELS; genders = GENDERS;
  color = statusColor;
  private timer: ReturnType<typeof setTimeout> | undefined;

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadList(), this.loadTypes(), firstValueFrom(this.api.get<ScholarFilters>('/admin/scholars/filters')).then((v) => this.filters.set(v))]);
  }

  async loadTypes(): Promise<void> {
    this.types.set((await firstValueFrom(this.api.get<ScholarshipType[]>('/admin/scholarship-types'))).filter((t) => t.isActive));
    this.filters.set(await firstValueFrom(this.api.get<ScholarFilters>('/admin/scholars/filters')));
  }

  async loadList(): Promise<void> {
    try {
      const r = await firstValueFrom(this.api.get<Paged<ScholarListItem>>('/admin/scholars', { search: this.search(), status: this.filterStatus(), scholarshipTypeId: this.filterType() || null, pageSize: 200 }));
      this.list.set(r.items); this.total.set(r.total);
    } catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  onSearch(v: string): void { this.search.set(v); clearTimeout(this.timer); this.timer = setTimeout(() => void this.loadList(), 300); }

  onTypeChange(id: number): void {
    this.f.scholarshipTypeId = id;
    const t = this.types().find((x) => x.id === id);
    if (t && !this.selectedId()) {
      this.f.stipendAmount = t.stipendAmount; this.f.stipendFrequency = t.paymentFrequency;
      this.f.scholarshipFundSource = t.fundSource ?? 'Government'; this.f.renewalConditions = t.renewalConditions ?? '';
    }
  }

  async select(id: number): Promise<void> {
    try {
      const d = await firstValueFrom(this.api.get<ScholarDetail>(`/admin/scholars/${id}`));
      this.selectedId.set(id); this.detail.set(d); this.pending = {};
      this.f = {
        studentId: d.studentId ?? '', firstName: d.firstName, middleName: d.middleName ?? '', lastName: d.lastName, suffix: '', email: d.email ?? '', contactNumber: d.contactNumber ?? '',
        dateOfBirth: dateInput(d.dateOfBirth), gender: d.gender ?? 'Male', address: d.address ?? '', course: d.course ?? '', yearLevel: d.yearLevel ?? '',
        scholarshipTypeId: d.scholarshipTypeId ?? 0, stipendAmount: d.stipendAmount, stipendFrequency: d.stipendFrequency ?? 'Monthly',
        scholarshipFundSource: d.scholarshipFundSource ?? 'Government', renewalConditions: d.renewalConditions ?? '', bankName: d.bankName ?? '',
        bankAccountNumber: d.bankAccountNumber ?? '', enrollmentDate: dateInput(d.enrollmentDate), expectedGraduation: dateInput(d.expectedGraduation),
        status: d.status, scholarNumber: d.scholarNumber,
      };
    } catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  docFor(key: string) { return this.detail()?.documents.find((d) => d.key === key) ?? null; }

  clear(): void { this.selectedId.set(null); this.detail.set(null); this.f = blank(); this.pending = {}; }

  pickPending(key: string, ev: Event): void { this.pending[key] = (ev.target as HTMLInputElement).files?.[0] ?? undefined; }

  private validate(): string | null {
    const f = this.f;
    if (!f.firstName.trim()) return 'First Name is required.';
    if (!f.lastName.trim()) return 'Last Name is required.';
    if (!f.email.trim()) return 'Email is required.';
    if (!f.course) return 'Please select a course.';
    if (!f.yearLevel) return 'Please select a year level.';
    if (!f.scholarshipTypeId) return 'Please select a scholarship type.';
    return null;
  }

  private payload(): ScholarSave {
    const f = this.f; const n = (s: string) => (s.trim() ? s.trim() : null);
    return {
      studentId: n(f.studentId), firstName: f.firstName.trim(), middleName: n(f.middleName), lastName: f.lastName.trim(), suffix: n(f.suffix), email: f.email.trim(),
      contactNumber: n(f.contactNumber), dateOfBirth: n(f.dateOfBirth), gender: f.gender, address: n(f.address), course: f.course, yearLevel: f.yearLevel,
      scholarshipTypeId: f.scholarshipTypeId, stipendAmount: Number(f.stipendAmount) || 0, stipendFrequency: f.stipendFrequency, scholarshipFundSource: f.scholarshipFundSource,
      renewalConditions: n(f.renewalConditions), bankName: n(f.bankName), bankAccountNumber: n(f.bankAccountNumber), enrollmentDate: n(f.enrollmentDate),
      expectedGraduation: n(f.expectedGraduation), status: f.status,
    };
  }

  async save(): Promise<void> {
    const problem = this.validate();
    if (problem) { void this.dlg.warning(problem); return; }
    this.busy.set(true);
    try {
      if (!this.selectedId()) {
        const c = await firstValueFrom(this.api.post<ScholarCreated>('/admin/scholars', this.payload()));
        // attach the chosen documents (marks those requirements Submitted)
        const detail = await firstValueFrom(this.api.get<ScholarDetail>(`/admin/scholars/${c.id}`));
        for (const d of DOCS) {
          const file = this.pending[d.key]; const doc = detail.documents.find((x) => x.key === d.key);
          if (file && doc) { const fd = new FormData(); fd.append('file', file, file.name); await firstValueFrom(this.api.upload(`/admin/compliance/${doc.complianceId}/file`, fd)); }
        }
        this.created.set(c); this.clear();
      } else {
        await firstValueFrom(this.api.put(`/admin/scholars/${this.selectedId()}`, this.payload()));
        await this.select(this.selectedId()!);
        void this.dlg.success('Scholar updated successfully!');
      }
      await this.loadList();
    } catch (e) { void this.dlg.error(errorMessage(e), 'Error saving scholar'); } finally { this.busy.set(false); }
  }

  async toggleStatus(): Promise<void> {
    const id = this.selectedId(); if (!id) return;
    const active = this.f.status === 'Active';
    if (!(await this.dlg.confirm(`Are you sure you want to ${active ? 'deactivate' : 'reactivate'} this scholar?`, `Confirm ${active ? 'deactivate' : 'reactivate'}`))) return;
    try { await firstValueFrom(this.api.post(`/admin/scholars/${id}/toggle-status`)); await this.select(id); await this.loadList(); }
    catch (e) { void this.dlg.error(errorMessage(e)); }
  }

  async openDoc(complianceId: number): Promise<void> { try { await this.api.open(`/admin/compliance/${complianceId}/file`); } catch (e) { void this.dlg.error(errorMessage(e)); } }

  async replaceDoc(complianceId: number, ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file, file.name);
    try { await firstValueFrom(this.api.upload(`/admin/compliance/${complianceId}/file`, fd)); await this.select(this.selectedId()!); } catch (e) { void this.dlg.error(errorMessage(e)); }
    input.value = '';
  }

  async openDetails(id: number): Promise<void> {
    try {
      const [d, c] = await Promise.all([
        firstValueFrom(this.api.get<ScholarDetail>(`/admin/scholars/${id}`)),
        firstValueFrom(this.api.get<{ items: ComplianceItem[] }>(`/admin/scholars/${id}/compliance`)),
      ]);
      this.detailItems.set(c.items); this.details.set(d);
    } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
}
