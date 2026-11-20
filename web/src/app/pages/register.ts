import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../core/api';
import { DialogService } from '../core/dialog';
import { PesoPipe } from '../core/format';
import { ScholarshipType } from '../core/models';
import { AppIcon } from '../shared/icon';

export const COURSES = [
  'Bachelor of Science in Business Administration (Major in Financial Management)',
  'Bachelor of Science in Business Administration (Major in Marketing Management)',
  'Bachelor of Science in Business Administration (Major in Human Resource Management)',
  'Bachelor of Science in Criminology',
  'Bachelor of Elementary Education (Generalist)',
  'Bachelor of Secondary Education (Major in English)',
  'Bachelor of Secondary Education (Major in Social Studies)',
  'Bachelor of Secondary Education (Major in Values Education)',
  'Bachelor of Science in Information Technology',
  'Bachelor of Science in Tourism Management',
];
export const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
export const GENDERS = ['Male', 'Female', 'Other'];

interface DocSlot { key: string; label: string; hint: string; required: boolean; icon: string; file: File | null; }

export const BANKS = ['BDO Unibank', 'Bank of the Philippine Islands (BPI)', 'Metrobank', 'Land Bank of the Philippines', 'Philippine National Bank (PNB)', 'UnionBank', 'Security Bank', 'RCBC', 'China Bank', 'DBP', 'GCash', 'Maya', 'Other'];

/** Mirrors the WinForms Register screen (public scholar application). */
@Component({
  selector: 'app-register',
  imports: [AppIcon, FormsModule, RouterLink, PesoPipe],
  template: `
    <div class="min-h-screen bg-cover bg-top bg-fixed px-4 pb-12 pt-[max(210px,25vh)]"
         style="background-image: linear-gradient(rgba(0,32,38,.55), rgba(0,32,38,.55)), url('assets/login-bg.png'); background-color: #0b3d44">
      <div class="mx-auto mb-5 text-center text-[snow]">
        <h1 class="text-[24px] font-bold">Apply for a scholarship</h1>
        <p class="text-[15px]">It takes about 5 minutes. Have your documents ready as PDF or photo.</p>
      </div>

      <form class="mx-auto max-w-[760px] space-y-5" (ngSubmit)="submit()" #f="ngForm" novalidate>
        <p class="rounded-lg bg-white/95 px-5 py-3 text-[13px] text-[#333] shadow-xl">
          <b>How this works:</b> you don't create a password now. After the Scholarship Office approves your application, we email your Student ID and a temporary password.
          Fields marked <span class="font-bold text-[#c62828]">*</span> are required; the rest are <i>optional</i>.
        </p>

        <section class="rounded-[18px] bg-white/95 p-6 shadow-xl" aria-labelledby="h-personal">
          <h2 id="h-personal" class="reg-h"><span class="reg-n">1</span>About you</h2>
          <div class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <div><label class="reg-l req" for="fn">First name</label><input id="fn" class="input" name="firstName" [(ngModel)]="m.firstName" required maxlength="100" autocomplete="given-name" /></div>
            <div><label class="reg-l opt" for="mn">Middle name</label><input id="mn" class="input" name="middleName" [(ngModel)]="m.middleName" maxlength="100" autocomplete="additional-name" /></div>
            <div><label class="reg-l req" for="ln">Last name</label><input id="ln" class="input" name="lastName" [(ngModel)]="m.lastName" required maxlength="100" autocomplete="family-name" /></div>
            <div><label class="reg-l opt" for="sf">Suffix</label><input id="sf" class="input" name="suffix" [(ngModel)]="m.suffix" maxlength="30" placeholder="Jr., III" /></div>
            <div><label class="reg-l opt" for="dob">Date of birth</label><input id="dob" class="input" type="date" name="dob" [(ngModel)]="m.dateOfBirth" [max]="todayIso" autocomplete="bday" /></div>
            <div><label class="reg-l req" for="gd">Gender</label>
              <select id="gd" class="input" name="gender" [(ngModel)]="m.gender" required><option value="">Select…</option>@for (g of genders; track g) { <option>{{ g }}</option> }</select></div>
            <div><label class="reg-l req" for="em">Email</label><input id="em" class="input" type="email" name="email" [(ngModel)]="m.email" required email maxlength="150" autocomplete="email" /></div>
            <div><label class="reg-l req" for="cn">Mobile number</label><input id="cn" class="input" type="tel" name="contactNumber" [(ngModel)]="m.contactNumber" required maxlength="30" autocomplete="tel" placeholder="09XX XXX XXXX" /></div>
            <div class="sm:col-span-2"><label class="reg-l opt" for="ad">Home address</label><input id="ad" class="input" name="address" [(ngModel)]="m.address" maxlength="500" autocomplete="street-address" /></div>
          </div>
        </section>

        <section class="rounded-[18px] bg-white/95 p-6 shadow-xl" aria-labelledby="h-school">
          <h2 id="h-school" class="reg-h"><span class="reg-n">2</span>Your school</h2>
          <div class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <div><label class="reg-l req" for="sid">Student ID</label><input id="sid" class="input" name="studentId" [(ngModel)]="m.studentId" required maxlength="50" /><p class="reg-hint">This becomes your login username.</p></div>
            <div><label class="reg-l opt" for="prog">Program level</label>
              <select id="prog" class="input" name="program" [(ngModel)]="m.program">@for (p of programs; track p) { <option>{{ p }}</option> }</select></div>
            <div class="sm:col-span-2"><label class="reg-l opt" for="hei">School (Higher Education Institution)</label><input id="hei" class="input" name="hei" [(ngModel)]="m.hei" maxlength="200" /></div>
            <div class="sm:col-span-2"><label class="reg-l req" for="dg">Degree program</label>
              <select id="dg" class="input" name="degree" [(ngModel)]="m.degreeProgram" required><option value="">Select…</option>@for (c of courses; track c) { <option>{{ c }}</option> }</select></div>
            <div><label class="reg-l req" for="yl">Year level</label>
              <select id="yl" class="input" name="year" [(ngModel)]="m.yearLevel" required><option value="">Select…</option>@for (y of years; track y) { <option>{{ y }}</option> }</select></div>
            <div></div>
            <div><label class="reg-l opt" for="en">Enrollment date</label><input id="en" class="input" type="date" name="enroll" [(ngModel)]="m.enrollmentDate" /></div>
            <div><label class="reg-l opt" for="gr">Expected graduation</label><input id="gr" class="input" type="date" name="grad" [(ngModel)]="m.expectedGraduation" /></div>
          </div>
        </section>

        <section class="rounded-[18px] bg-white/95 p-6 shadow-xl" aria-labelledby="h-sch">
          <h2 id="h-sch" class="reg-h"><span class="reg-n">3</span>Scholarship and payout</h2>
          <div class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <div class="sm:col-span-2"><label class="reg-l req" for="st">Scholarship you are applying for</label>
              <select id="st" class="input" name="type" [(ngModel)]="m.scholarshipTypeId" required><option [ngValue]="0">Select…</option>@for (t of types(); track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }</select></div>
            @if (selected(); as t) {
              <div class="rounded-lg border border-brand/30 bg-[#f0f7f8] p-3 text-[13px] sm:col-span-2">
                <p class="mb-1 text-[13px] font-bold text-brand">What this scholarship gives (filled in for you)</p>
                <p>Stipend: <b class="text-brand">{{ t.stipendAmount | peso }}</b> · {{ t.paymentFrequency }}</p>
                <p>Fund source: <b class="text-brand">{{ t.fundSource || 'Government' }}</b></p>
                <p>To keep it: <b class="text-brand">{{ t.renewalConditions || 'N/A' }}</b></p>
              </div>
            }
            <div><label class="reg-l opt" for="bk">Bank for your stipend</label>
              <select id="bk" class="input" name="bank" [(ngModel)]="m.bankName"><option value="">Select…</option>@for (b of banks; track b) { <option>{{ b }}</option> }</select></div>
            <div><label class="reg-l opt" for="ac">Account number</label><input id="ac" class="input" name="acct" inputmode="numeric" [(ngModel)]="m.bankAccountNumber" maxlength="50" /></div>
          </div>
        </section>

        <section class="rounded-[18px] bg-white/95 p-6 shadow-xl" aria-labelledby="h-docs">
          <h2 id="h-docs" class="reg-h"><span class="reg-n">4</span>Your documents</h2>
          <p class="mb-3 text-[13px] leading-snug text-[#444]">Upload each once — PDF, Word or photo, up to 10 MB. When you are approved they are saved to your account, so you won't be asked again. Optional ones can be added later from the Compliance page.</p>
          <div class="space-y-2">
            @for (d of docs(); track d.key) {
              <div class="flex flex-wrap items-center gap-3 rounded-lg border border-[#d4d4d4] px-3 py-2">
                <app-icon [name]="d.file ? 'checked' : d.icon" class="h-5 w-5" [class.text-ok]="!!d.file"></app-icon>
                <div class="min-w-[180px] flex-1">
                  <p class="text-[14px] font-bold text-[#1e1e1e]">{{ d.label }} <span class="text-[12px] font-normal" [class.text-[#c62828]]="d.required" [class.text-[#555]]="!d.required">{{ d.required ? '* required' : '(optional)' }}</span></p>
                  <p class="truncate text-[12px] text-[#444]">{{ d.file ? d.file.name : d.hint }}</p>
                </div>
                <label class="btn btn-outline !h-[34px] cursor-pointer">{{ d.file ? 'Replace' : 'Choose file' }}
                  <input type="file" class="sr-only" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" (change)="pick(d.key, $event)" [attr.aria-label]="(d.file ? 'Replace ' : 'Choose file for ') + d.label" /></label>
              </div>
            }
          </div>
          <div class="mt-4"><label class="reg-l opt" for="nt">Anything the Scholarship Office should know?</label><textarea id="nt" class="input" rows="3" name="notes" [(ngModel)]="m.notes" maxlength="2000"></textarea></div>
        </section>

        <section class="rounded-[18px] bg-white/95 p-6 shadow-xl" aria-labelledby="h-send">
          <h2 id="h-send" class="reg-h"><span class="reg-n">5</span>Review and send</h2>
          <label class="flex cursor-pointer items-start gap-3 text-[13px] leading-snug text-[#333]">
            <input type="checkbox" name="consent" class="mt-[3px] h-[18px] w-[18px] shrink-0" [(ngModel)]="consent" />
            <span><span class="font-bold text-[#c62828]">*</span> I agree that Legacy College of Compostela may collect and use my personal information — including my birth certificate, enrollment records and bank details —
              only to evaluate and administer my scholarship, as described in the Data Privacy Act of 2012 (RA 10173). I can ask the Scholarship Office to correct or delete my data.</span>
          </label>
          @if (error()) { <p class="mt-4 rounded bg-[#fdecea] px-3 py-2 text-[14px] text-[#8c1d13]" role="alert">{{ error() }}</p> }
          <button type="submit" [disabled]="busy()" class="btn btn-brand mt-5 !h-[52px] w-full !text-[17px]">{{ busy() ? 'Submitting…' : 'Submit application' }}</button>
          <p class="mt-4 text-center text-[14px]">Already have an account? <a routerLink="/login" class="text-[#0b5cad] underline">Log in</a></p>
        </section>
      </form>
    </div>
  `,
})
export class RegisterPage implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  private router = inject(Router);

  programs = ['Undergraduate', 'Graduate', 'Post-Graduate', 'Doctorate'];
  genders = GENDERS; courses = COURSES; years = YEAR_LEVELS; banks = BANKS;
  consent = false;
  readonly todayIso = new Date().toISOString().slice(0, 10);
  types = signal<ScholarshipType[]>([]);
  busy = signal(false);
  error = signal('');
  m = {
    studentId: '', firstName: '', middleName: '', lastName: '', suffix: '', email: '', contactNumber: '', dateOfBirth: '', gender: '', address: '',
    program: 'Undergraduate', hei: 'Legacy College of Compostela', degreeProgram: '', yearLevel: '', scholarshipTypeId: 0,
    enrollmentDate: '', expectedGraduation: '', bankName: '', bankAccountNumber: '', notes: '',
  };
  docs = signal<DocSlot[]>([
    { key: 'psa', label: 'PSA Birth Certificate', hint: 'Official birth certificate from the PSA', required: true, icon: 'attachment', file: null },
    { key: 'coe', label: 'Certificate of Enrollment (COE)', hint: 'Proof you are enrolled this semester', required: true, icon: 'note', file: null },
    { key: 'cor', label: 'Certificate of Registration (COR)', hint: 'Your list of enrolled subjects', required: true, icon: 'task', file: null },
    { key: 'grades', label: 'Latest Grades / Transcript (TOR)', hint: 'Most recent report of grades', required: false, icon: 'chart', file: null },
    { key: 'contract', label: 'Scholarship Contract', hint: 'Signed copy, if you already have one', required: false, icon: 'file', file: null },
  ]);
  /** Plain method (not computed): the form model is not a signal, so this must be re-evaluated on every change detection. */
  selected(): ScholarshipType | null { return this.types().find((t) => t.id === this.m.scholarshipTypeId) ?? null; }

  async ngOnInit(): Promise<void> {
    try { this.types.set(await firstValueFrom(this.api.get<ScholarshipType[]>('/scholarship-types/active'))); } catch (e) { this.error.set(errorMessage(e)); }
  }

  pick(key: string, ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0] ?? null;
    if (file && file.size > 10 * 1024 * 1024) { void this.dlg.warning('File is too large (max 10 MB).'); return; }
    this.docs.update((ds) => ds.map((d) => (d.key === key ? { ...d, file } : d)));
  }

  private validate(): string | null {
    const m = this.m;
    if (!m.studentId.trim()) return 'Please enter your Student ID.';
    if (!m.firstName.trim()) return 'Please enter your First Name.';
    if (!m.lastName.trim()) return 'Please enter your Last Name.';
    if (!m.email.trim()) return 'Please enter your Email.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email.trim())) return 'Please enter a valid Email address.';
    if (!m.contactNumber.trim()) return 'Please enter your Contact Number.';
    if (!m.scholarshipTypeId) return 'Please select a Scholarship Type.';
    if (!m.gender) return 'Please select your Gender.';
    if (!m.yearLevel) return 'Please select your Year Level.';
    if (!m.degreeProgram) return 'Please select your Degree Program.';
    for (const d of this.docs()) if (d.required && !d.file) return `Please upload your ${d.label}.`;
    if (!this.consent) return 'Please tick the data privacy consent before submitting.';
    return null;
  }

  async submit(): Promise<void> {
    this.error.set('');
    const problem = this.validate();
    if (problem) { this.error.set(problem); return; }
    const fd = new FormData();
    const m = this.m as Record<string, string | number>;
    const names: Record<string, string> = { studentId: 'StudentId', firstName: 'FirstName', middleName: 'MiddleName', lastName: 'LastName', suffix: 'Suffix', email: 'Email',
      contactNumber: 'ContactNumber', dateOfBirth: 'DateOfBirth', gender: 'Gender', address: 'Address', program: 'Program', hei: 'Hei', degreeProgram: 'DegreeProgram',
      yearLevel: 'YearLevel', scholarshipTypeId: 'ScholarshipTypeId', enrollmentDate: 'EnrollmentDate', expectedGraduation: 'ExpectedGraduation', bankName: 'BankName',
      bankAccountNumber: 'BankAccountNumber', notes: 'Notes' };
    for (const [k, v] of Object.entries(names)) { const val = m[k]; if (val !== '' && val !== null && val !== undefined) fd.append(v, String(val).trim()); }
    for (const d of this.docs()) if (d.file) fd.append(d.key, d.file, d.file.name);

    this.busy.set(true);
    try {
      await firstValueFrom(this.api.upload('/registrations', fd));
      await this.dlg.success('Registration submitted successfully!\n\nYour application will be reviewed by the Scholarship Office.\nYou will receive an email notification once approved.');
      await this.router.navigateByUrl('/login');
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }
}
