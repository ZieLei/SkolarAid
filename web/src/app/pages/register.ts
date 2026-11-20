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

interface DocSlot { key: string; label: string; required: boolean; icon: string; file: File | null; }

/** Mirrors the WinForms Register screen (public scholar application). */
@Component({
  selector: 'app-register',
  imports: [AppIcon, FormsModule, RouterLink, PesoPipe],
  template: `
    <div class="min-h-screen bg-cover bg-center px-4 pb-10 pt-[17vh] font-['Segoe_UI','Microsoft_Sans_Serif',Arial,sans-serif]"
         style="background-image: url('assets/login-bg.png'); background-color: #0b3d44">
      <div class="mx-auto mb-4 text-center text-[snow]">
        <p class="text-[20px]">Hello there,</p>
        <h1 class="text-[22.75px] font-bold">Welcome to IskolarAid</h1>
        <p class="text-[14.25px]">Register to apply for scholarship program</p>
      </div>

      <form class="mx-auto grid max-w-[1180px] gap-5 lg:grid-cols-[1.2fr_1fr]" (ngSubmit)="submit()" #f="ngForm" novalidate>
        <section class="rounded-[18px] bg-white/95 p-6 shadow-xl">
          <div class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <div><label class="field-label !text-black" for="sid">Student ID:*</label><input id="sid" class="input" name="studentId" [(ngModel)]="m.studentId" required maxlength="50" /></div>
            <div><label class="field-label !text-black" for="prog">Program:</label>
              <select id="prog" class="input" name="program" [(ngModel)]="m.program">@for (p of programs; track p) { <option>{{ p }}</option> }</select></div>
            <div><label class="field-label !text-black">First Name:*</label><input class="input" name="firstName" [(ngModel)]="m.firstName" required maxlength="100" /></div>
            <div><label class="field-label !text-black">Middle Name:</label><input class="input" name="middleName" [(ngModel)]="m.middleName" maxlength="100" /></div>
            <div><label class="field-label !text-black">Last Name:*</label><input class="input" name="lastName" [(ngModel)]="m.lastName" required maxlength="100" /></div>
            <div><label class="field-label !text-black">Suffix:</label><input class="input" name="suffix" [(ngModel)]="m.suffix" maxlength="30" placeholder="Jr., III" /></div>
            <div><label class="field-label !text-black">Email:*</label><input class="input" type="email" name="email" [(ngModel)]="m.email" required email maxlength="150" /></div>
            <div><label class="field-label !text-black">Contact Number:*</label><input class="input" name="contactNumber" [(ngModel)]="m.contactNumber" required maxlength="30" /></div>
            <div><label class="field-label !text-black">Date of Birth:</label><input class="input" type="date" name="dob" [(ngModel)]="m.dateOfBirth" /></div>
            <div><label class="field-label !text-black">Gender:*</label>
              <select class="input" name="gender" [(ngModel)]="m.gender" required><option value="">Select...</option>@for (g of genders; track g) { <option>{{ g }}</option> }</select></div>
            <div class="sm:col-span-2"><label class="field-label !text-black">Address:</label><input class="input" name="address" [(ngModel)]="m.address" maxlength="500" /></div>
            <div class="sm:col-span-2"><label class="field-label !text-black">HEI (Higher Education Institution):</label><input class="input" name="hei" [(ngModel)]="m.hei" maxlength="200" /></div>
            <div class="sm:col-span-2"><label class="field-label !text-black">Degree Program:*</label>
              <select class="input" name="degree" [(ngModel)]="m.degreeProgram" required><option value="">Select...</option>@for (c of courses; track c) { <option>{{ c }}</option> }</select></div>
            <div><label class="field-label !text-black">Year Level:*</label>
              <select class="input" name="year" [(ngModel)]="m.yearLevel" required><option value="">Select...</option>@for (y of years; track y) { <option>{{ y }}</option> }</select></div>
            <div><label class="field-label !text-black">Scholarship Type:*</label>
              <select class="input" name="type" [(ngModel)]="m.scholarshipTypeId" required><option [ngValue]="0">Select...</option>@for (t of types(); track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }</select></div>
            <div><label class="field-label !text-black">Enrollment Date:</label><input class="input" type="date" name="enroll" [(ngModel)]="m.enrollmentDate" /></div>
            <div><label class="field-label !text-black">Expected Graduation Date:</label><input class="input" type="date" name="grad" [(ngModel)]="m.expectedGraduation" /></div>
            <div><label class="field-label !text-black">Bank Name:</label><input class="input" name="bank" [(ngModel)]="m.bankName" maxlength="100" /></div>
            <div><label class="field-label !text-black">Bank Account Number:</label><input class="input" name="acct" [(ngModel)]="m.bankAccountNumber" maxlength="50" /></div>
          </div>
        </section>

        <section class="space-y-4 rounded-[18px] bg-white/95 p-6 shadow-xl">
          @if (selected(); as t) {
            <div class="rounded-lg border border-brand/30 bg-[#f0f7f8] p-3 text-[13px]">
              <p class="mb-1 text-[12px] font-bold text-brand">📋 Scholarship Details (Auto-Filled)</p>
              <p>Stipend Amount: <b class="text-brand">{{ t.stipendAmount | peso }}</b></p>
              <p>Stipend Frequency: <b class="text-brand">{{ t.paymentFrequency }}</b></p>
              <p>Fund Source: <b class="text-brand">{{ t.fundSource || 'Government' }}</b></p>
              <p>Renewal Conditions: <b class="text-brand">{{ t.renewalConditions || 'N/A' }}</b></p>
            </div>
          }
          <div>
            <p class="mb-2 text-[14px] font-bold text-brand">Required Documents:*</p>
            <p class="mb-3 text-[12px] leading-snug text-muted">Upload these once. When your application is approved they are saved to your scholar account, so you won't be asked for them again. Optional documents can be added later from the Compliance page.</p>
            @for (d of docs(); track d.key) {
              <div class="mb-2">
                <label class="block cursor-pointer rounded px-3 py-[7px] text-center text-[13px] text-white transition-colors"
                       [class.bg-brand]="!d.file" [class.bg-ok]="!!d.file">
                  <app-icon [name]="d.file ? 'checked' : d.icon" class="mr-1 inline-flex h-4 w-4 align-[-3px]"></app-icon>{{ d.file ? d.label + ' Uploaded' : 'Upload ' + d.label + (d.required ? '' : ' (optional)') }}
                  <input type="file" class="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" (change)="pick(d.key, $event)" />
                </label>
                @if (d.file) { <p class="mt-[2px] truncate text-[12px] text-muted">📎 {{ d.file.name }}</p> }
              </div>
            }
          </div>
          <div><label class="field-label !text-black">Notes:</label><textarea class="input" rows="3" name="notes" [(ngModel)]="m.notes" maxlength="2000"></textarea></div>

          @if (error()) { <p class="rounded bg-red-50 px-2 py-1 text-[13px] text-red-700" role="alert">{{ error() }}</p> }
          <button type="submit" [disabled]="busy()" class="h-[48px] w-full rounded-[10px] bg-login text-[16px] font-bold text-white hover:brightness-110">
            {{ busy() ? 'SUBMITTING...' : 'SUBMIT APPLICATION' }}
          </button>
          <p class="text-center text-[13px]">Already have an account? <a routerLink="/login" class="text-blue-700 underline">Log In</a></p>
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
  genders = GENDERS; courses = COURSES; years = YEAR_LEVELS;
  types = signal<ScholarshipType[]>([]);
  busy = signal(false);
  error = signal('');
  m = {
    studentId: '', firstName: '', middleName: '', lastName: '', suffix: '', email: '', contactNumber: '', dateOfBirth: '', gender: '', address: '',
    program: 'Undergraduate', hei: 'Legacy College of Compostela', degreeProgram: '', yearLevel: '', scholarshipTypeId: 0,
    enrollmentDate: '', expectedGraduation: '', bankName: '', bankAccountNumber: '', notes: '',
  };
  docs = signal<DocSlot[]>([
    { key: 'psa', label: 'PSA Birth Certificate', required: true, icon: 'attachment', file: null },
    { key: 'coe', label: 'Certificate of Enrollment', required: true, icon: 'note', file: null },
    { key: 'cor', label: 'Certificate of Registration', required: true, icon: 'task', file: null },
    { key: 'grades', label: 'Latest Grades/TOR', required: false, icon: 'chart', file: null },
    { key: 'contract', label: 'Scholarship Contract', required: false, icon: 'file', file: null },
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
