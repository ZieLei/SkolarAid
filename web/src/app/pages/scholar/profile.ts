import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { ToastService } from '../../core/toast';
import { DatePipeShort, PesoPipe } from '../../core/format';
import { ScholarProfile } from '../../core/models';
import { AppIcon } from '../../shared/icon';
import { BANKS } from '../register';

/** Read-only facts are plain text; the four fields a scholar may change are real inputs with their own Save button. */
@Component({
  selector: 'app-scholar-profile',
  imports: [AppIcon, FormsModule, PesoPipe, DatePipeShort],
  template: `
    @if (p(); as p) {
      <section class="card mb-5 flex items-center gap-5 p-6">
        <app-icon name="user" class="h-[80px] w-[80px]"></app-icon>
        <div><h2 class="text-[24px] font-bold text-ink">{{ p.firstName }} {{ p.middleName }} {{ p.lastName }}</h2>
          <p class="text-[14px] font-bold" [style.color]="p.status === 'Active' ? '#17692c' : '#4b5563'"><span class="mr-2 inline-block h-[10px] w-[10px] rounded-full bg-current align-middle"></span>{{ p.status }} Scholar · {{ p.scholarNumber }}</p></div>
      </section>

      @if (missing().length) {
        <div class="mb-5 flex flex-wrap items-center gap-3 rounded-lg border-l-4 border-warn bg-[#fff8e6] px-5 py-4" role="status">
          <app-icon name="alert" class="h-[28px] w-[28px] text-[#8a5300]"></app-icon>
          <p class="min-w-[220px] flex-1 text-[14px] text-ink"><b class="text-brand">Finish your profile.</b> We still need your {{ missingText() }}. Stipends are sent to the bank account you give here.</p>
        </div>
      }

      <div class="grid gap-5 xl:grid-cols-2">
        <div class="space-y-5">
          <section class="card p-6">
            <h3 class="mb-3 text-[18px] font-bold text-brand">Contact and payout</h3>
            <p class="mb-4 text-[12px] text-[#4b5563]">You can edit these. Everything else on this page is managed by the Scholarship Office.</p>
            <div class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <div><label class="field-label" for="pc">Mobile number</label><input id="pc" class="input" [(ngModel)]="form.contactNumber" maxlength="30" inputmode="tel" /></div>
              <div class="sm:col-span-2"><label class="field-label" for="pa">Home address</label><input id="pa" class="input" [(ngModel)]="form.address" maxlength="500" /></div>
              <div><label class="field-label" for="pb">Bank</label>
                <select id="pb" class="input" [(ngModel)]="form.bankName"><option value="">Select…</option>@for (b of banks; track b) { <option>{{ b }}</option> }@if (form.bankName && !banks.includes(form.bankName)) { <option>{{ form.bankName }}</option> }</select></div>
              <div><label class="field-label" for="pn">Account number</label><input id="pn" class="input" [(ngModel)]="form.bankAccountNumber" maxlength="50" inputmode="numeric" /></div>
            </div>
            <div class="mt-5 flex items-center gap-3">
              <button class="btn btn-brand !h-[40px]" [disabled]="busy() || !dirty()" (click)="save()">{{ busy() ? 'Saving…' : 'Save changes' }}</button>
              @if (!dirty()) { <span class="text-[12px] text-[#4b5563]">No changes to save.</span> }
            </div>
          </section>

          <section class="card p-6">
            <h3 class="mb-3 text-[18px] font-bold text-brand">Personal information</h3>
            <dl class="grid grid-cols-[150px_1fr] gap-y-2 text-[14px]">
              <dt class="text-[#4b5563]">Full name</dt><dd>{{ p.firstName }} {{ p.middleName }} {{ p.lastName }}</dd>
              <dt class="text-[#4b5563]">Email</dt><dd class="break-all">{{ p.email || '—' }}</dd>
              <dt class="text-[#4b5563]">Birth date</dt><dd>{{ p.dateOfBirth | dmy: '—' }}</dd>
              <dt class="text-[#4b5563]">Gender</dt><dd>{{ p.gender || '—' }}</dd>
            </dl>
          </section>
        </div>

        <div class="space-y-5">
          <section class="card p-6">
            <h3 class="mb-3 text-[18px] font-bold text-brand">School</h3>
            <dl class="grid grid-cols-[170px_1fr] gap-y-2 text-[14px]">
              <dt class="text-[#4b5563]">Student ID</dt><dd>{{ p.studentId || '—' }}</dd>
              <dt class="text-[#4b5563]">School</dt><dd>{{ p.hei || '—' }}</dd>
              <dt class="text-[#4b5563]">Course</dt><dd>{{ p.course || '—' }}</dd>
              <dt class="text-[#4b5563]">Year level</dt><dd>{{ p.yearLevel || '—' }}</dd>
              <dt class="text-[#4b5563]">Enrolled since</dt><dd>{{ p.enrollmentDate | dmy: '—' }}</dd>
              <dt class="text-[#4b5563]">Expected graduation</dt><dd>{{ p.expectedGraduation | dmy: '—' }}</dd>
            </dl>
          </section>
          <section class="card p-6">
            <h3 class="mb-3 text-[18px] font-bold text-brand">Scholarship</h3>
            <dl class="grid grid-cols-[170px_1fr] gap-y-2 text-[14px]">
              <dt class="text-[#4b5563]">Scholarship</dt><dd>{{ p.scholarshipType || '—' }}</dd>
              <dt class="text-[#4b5563]">Stipend</dt><dd>{{ p.stipendAmount | peso }}</dd>
              <dt class="text-[#4b5563]">Fund source</dt><dd>{{ p.fundSource || '—' }}</dd>
              <dt class="text-[#4b5563]">To keep it</dt><dd>{{ p.renewalConditions || '—' }}</dd>
              <dt class="text-[#4b5563]">Status</dt><dd>{{ p.status }}</dd>
            </dl>
          </section>
        </div>
      </div>
    }
  `,
})
export class ScholarProfilePage implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  private toast = inject(ToastService);
  banks = BANKS;
  p = signal<ScholarProfile | null>(null);
  busy = signal(false);
  form = { contactNumber: '', address: '', bankName: '', bankAccountNumber: '' };
  private saved = signal('');
  private snapshot = () => JSON.stringify(this.form);
  /** Template-friendly: re-evaluated each change detection because the form is a plain object. */
  dirty = () => this.snapshot() !== this.saved();

  missing = computed(() => {
    const p = this.p(); if (!p) return [];
    const m: string[] = [];
    if (!p.contactNumber) m.push('mobile number');
    if (!p.address) m.push('home address');
    if (!p.bankName) m.push('bank');
    if (!p.bankAccountNumber) m.push('bank account number');
    return m;
  });
  missingText = computed(() => { const m = this.missing(); return m.length > 1 ? m.slice(0, -1).join(', ') + ' and ' + m[m.length - 1] : m[0] ?? ''; });

  async ngOnInit(): Promise<void> {
    try { this.apply(await firstValueFrom(this.api.get<ScholarProfile>('/scholar/profile'))); } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
  private apply(p: ScholarProfile): void {
    this.p.set(p);
    this.form = { contactNumber: p.contactNumber ?? '', address: p.address ?? '', bankName: p.bankName ?? '', bankAccountNumber: p.bankAccountNumber ?? '' };
    this.saved.set(this.snapshot());
  }
  async save(): Promise<void> {
    this.busy.set(true);
    try { this.apply(await firstValueFrom(this.api.put<ScholarProfile>('/scholar/profile', this.form))); this.toast.show('Profile saved.'); }
    catch (e) { void this.dlg.error(errorMessage(e), 'Could not save'); } finally { this.busy.set(false); }
  }
}
