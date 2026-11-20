import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { DatePipeShort, PesoPipe } from '../../core/format';
import { ScholarProfile } from '../../core/models';

@Component({
  selector: 'app-scholar-profile',
  imports: [PesoPipe, DatePipeShort],
  template: `
    @if (p(); as p) {
      <section class="card mb-5 flex items-center gap-5 p-6">
        <img src="assets/user.png" alt="" class="h-[80px] w-[80px] object-contain" />
        <div><h2 class="text-[22px] font-bold text-ink">{{ p.firstName }} {{ p.middleName }} {{ p.lastName }}</h2>
          <p class="text-[12pt] font-bold" [style.color]="p.status === 'Active' ? '#28a745' : '#646464'">● {{ p.status }} Scholar</p></div>
      </section>
      <div class="grid gap-5 xl:grid-cols-2">
        <section class="card p-6">
          <h3 class="mb-4 text-[16pt] font-bold text-brand">Personal Information</h3>
          <div class="grid grid-cols-3 gap-x-4 gap-y-3">
            <div><span class="field-label">First Name</span><p class="input flex items-center bg-gray-50">{{ p.firstName }}</p></div>
            <div><span class="field-label">Middle Name</span><p class="input flex items-center bg-gray-50">{{ p.middleName }}</p></div>
            <div><span class="field-label">Last Name</span><p class="input flex items-center bg-gray-50">{{ p.lastName }}</p></div>
            <div class="col-span-3"><span class="field-label">Email Address</span><p class="input flex items-center bg-gray-50">{{ p.email }}</p></div>
            <div class="col-span-3"><span class="field-label">Contact Number</span><p class="input flex items-center bg-gray-50">{{ p.contactNumber }}</p></div>
            <div class="col-span-3"><span class="field-label">Address</span><p class="input flex items-center bg-gray-50">{{ p.address }}</p></div>
            <div class="col-span-2"><span class="field-label">Birth Date</span><p class="input flex items-center bg-gray-50">{{ p.dateOfBirth | dmy }}</p></div>
            <div><span class="field-label">Gender</span><p class="input flex items-center bg-gray-50">{{ p.gender }}</p></div>
            <div class="col-span-2"><span class="field-label">Bank Name:</span><p class="input flex items-center bg-gray-50">{{ p.bankName }}</p></div>
            <div class="col-span-3"><span class="field-label">Bank Account Number:</span><p class="input flex items-center bg-gray-50">{{ p.bankAccountNumber }}</p></div>
          </div>
        </section>
        <div class="space-y-5">
          <section class="card p-6">
            <h3 class="mb-4 text-[16pt] font-bold text-brand">Academic Information</h3>
            <div class="grid grid-cols-2 gap-x-4 gap-y-3">
              <div><span class="field-label">Student ID</span><p class="input flex items-center bg-gray-50">{{ p.studentId }}</p></div>
              <div><span class="field-label">Higher Education Institution</span><p class="input flex items-center bg-gray-50">{{ p.hei }}</p></div>
              <div class="col-span-2"><span class="field-label">Course</span><p class="input flex items-center bg-gray-50">{{ p.course }}</p></div>
              <div><span class="field-label">Year Level</span><p class="input flex items-center bg-gray-50">{{ p.yearLevel }}</p></div>
            </div>
          </section>
          <section class="card p-6">
            <h3 class="mb-4 text-[16pt] font-bold text-brand">Scholarship Information</h3>
            <div class="grid grid-cols-2 gap-x-4 gap-y-3">
              <div><span class="field-label">Scholar Number</span><p class="input flex items-center bg-gray-50">{{ p.scholarNumber }}</p></div>
              <div><span class="field-label">Enrollment Date</span><p class="input flex items-center bg-gray-50">{{ p.enrollmentDate | dmy }}</p></div>
              <div><span class="field-label">Scholarship Type</span><p class="input flex items-center bg-gray-50">{{ p.scholarshipType }}</p></div>
              <div><span class="field-label">Expected Graduation</span><p class="input flex items-center bg-gray-50">{{ p.expectedGraduation | dmy }}</p></div>
              <div><span class="field-label">Status</span><p class="input flex items-center bg-gray-50">{{ p.status }}</p></div>
              <div><span class="field-label">Stipend Amount</span><p class="input flex items-center bg-gray-50">{{ p.stipendAmount | peso }}</p></div>
              <div class="col-span-2"><span class="field-label">Renewal Conditions</span><p class="input flex items-center bg-gray-50">{{ p.renewalConditions }}</p></div>
              <div class="col-span-2"><span class="field-label">Scholarship Fund Source</span><p class="input flex items-center bg-gray-50">{{ p.fundSource }}</p></div>
            </div>
          </section>
        </div>
      </div>
    }
  `,
})
export class ScholarProfilePage implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  p = signal<ScholarProfile | null>(null);
  async ngOnInit(): Promise<void> { try { this.p.set(await firstValueFrom(this.api.get<ScholarProfile>('/scholar/profile'))); } catch (e) { void this.dlg.error(errorMessage(e)); } }
}
