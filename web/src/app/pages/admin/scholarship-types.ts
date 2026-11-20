import { Component, OnInit, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { PesoPipe } from '../../core/format';
import { ScholarshipType } from '../../core/models';
import { Modal } from '../../shared/modal';
import { ScrollCue } from '../../shared/scroll-cue';

/** "View Scholarships Management" dialog: list, add, activate/deactivate (no edit/delete, as in the desktop app). */
@Component({
  selector: 'app-scholarship-types',
  imports: [ScrollCue, Modal, FormsModule, PesoPipe],
  template: `
    <app-modal title="Scholarship Management" [width]="860" (closed)="closed.emit()">
      <div scrollCue class="grid-wrap max-h-[300px] rounded border border-[#e6e6e6]">
        <table class="dgrid">
          <thead><tr><th>Name</th><th>Stipend</th><th>Frequency</th><th>Scholars</th><th>Status</th><th class="w-[120px]"></th></tr></thead>
          <tbody>
            @for (t of types(); track t.id; let i = $index) {
              <tr [class.alt]="i % 2 === 1">
                <td>{{ t.name }}</td><td>{{ t.stipendAmount | peso }}</td><td>{{ t.paymentFrequency }}</td><td>{{ t.scholarCount }}</td>
                <td><span class="font-bold" [style.color]="t.isActive ? '#17692c' : '#595959'">{{ t.isActive ? 'Active' : 'Inactive' }}</span></td>
                <td>
                  @if (t.isActive) { <button class="btn btn-warn !h-[26px] !px-2 !text-[12px]" (click)="toggle(t, false)">Deactivate</button> }
                  @else { <button class="btn btn-ok !h-[26px] !px-2 !text-[12px]" (click)="toggle(t, true)">Activate</button> }
                </td>
              </tr>
            } @empty { <tr><td colspan="6" class="!py-6 text-center text-[#595959]">No scholarship types yet</td></tr> }
          </tbody>
        </table>
      </div>

      <h3 class="section-title mt-5">Add New Scholarship</h3>
      <form class="grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_auto]" (ngSubmit)="add()" #f="ngForm">
        <div><label class="field-label">Name</label><input class="input" name="n" [(ngModel)]="name" required maxlength="150" /></div>
        <div><label class="field-label">Stipend Amount</label><input class="input" type="number" min="0.01" step="0.01" name="a" [(ngModel)]="amount" required /></div>
        <div><label class="field-label">Frequency</label>
          <select class="input" name="f" [(ngModel)]="frequency">@for (x of freqs; track x) { <option>{{ x }}</option> }</select></div>
        <div class="flex items-end"><button class="btn btn-brand" type="submit" [disabled]="busy()">Add Scholarship</button></div>
      </form>
    </app-modal>
  `,
})
export class ScholarshipTypesDialog implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  closed = output<void>();
  changed = output<void>();
  types = signal<ScholarshipType[]>([]);
  busy = signal(false);
  freqs = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual'];
  name = ''; amount: number | null = null; frequency = 'Monthly';

  ngOnInit(): void { void this.load(); }
  async load(): Promise<void> { this.types.set(await firstValueFrom(this.api.get<ScholarshipType[]>('/admin/scholarship-types'))); }

  async add(): Promise<void> {
    if (!this.name.trim() || !this.amount || this.amount <= 0) { void this.dlg.warning('Invalid inputs'); return; }
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.post('/admin/scholarship-types', { name: this.name.trim(), stipendAmount: this.amount, paymentFrequency: this.frequency }));
      this.name = ''; this.amount = null; await this.load(); this.changed.emit();
      void this.dlg.success('Added successfully!');
    } catch (e) { void this.dlg.error(errorMessage(e)); } finally { this.busy.set(false); }
  }

  async toggle(t: ScholarshipType, active: boolean): Promise<void> {
    try {
      await firstValueFrom(this.api.post(`/admin/scholarship-types/${t.id}/${active ? 'activate' : 'deactivate'}`));
      await this.load(); this.changed.emit();
    } catch (e) { void this.dlg.error(errorMessage(e)); }
  }
}
