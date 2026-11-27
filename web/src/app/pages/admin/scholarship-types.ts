// =====================================================================
// scholarship-types.ts - pop-up for managing scholarship types.
// Opened from the Scholars page ("Manage scholarships" button).
// Lets the admin search types, add one, edit its stipend and turn it on or off.
// API: /api/admin/scholarship-types (ScholarshipTypesController).
// =====================================================================
import { Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { PesoPipe } from '../../core/format';
import { ScholarshipType } from '../../core/models';
import { Modal } from '../../shared/modal';
import { ScrollCue } from '../../shared/scroll-cue';

/** "Scholarship Management" dialog: search, add, edit stipend, activate/deactivate. */
@Component({
  selector: 'app-scholarship-types',
  imports: [ScrollCue, Modal, FormsModule, PesoPipe],
  template: `
    <app-modal title="Scholarship Management" [width]="960" (closed)="closed.emit()">
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <input
          class="input !w-[320px]"
          placeholder="Search scholarships (e.g. CHED, DOST, OWWA)…"
          aria-label="Search scholarships"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
        />
        @if (unset() > 0) {
          <span class="rounded-full bg-[#fff8e6] px-3 py-1 text-[12px] font-bold text-[#8a5300]"
            >{{ unset() }} without a stipend amount — set it with Edit before paying</span
          >
        }
      </div>
      <div scrollCue class="grid-wrap max-h-[360px] rounded border border-[#e6e6e6]">
        <table class="dgrid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Fund</th>
              <th>Stipend</th>
              <th>Frequency</th>
              <th>Scholars</th>
              <th>Status</th>
              <th class="w-[170px]"></th>
            </tr>
          </thead>
          <tbody>
            @for (t of shown(); track t.id; let i = $index) {
              <tr [class.alt]="i % 2 === 1">
                <td class="wrap" [title]="t.description ?? ''">{{ t.name }}</td>
                <td>{{ t.fundSource || '—' }}</td>
                @if (editing()?.id === t.id) {
                  <td>
                    <input
                      class="input !h-[28px] !w-[110px]"
                      type="number"
                      min="0.01"
                      step="0.01"
                      aria-label="Stipend amount"
                      [(ngModel)]="editAmount"
                    />
                  </td>
                  <td>
                    <select
                      class="input !h-[28px] !w-[120px]"
                      aria-label="Frequency"
                      [(ngModel)]="editFrequency"
                    >
                      @for (x of freqs; track x) {
                        <option>{{ x }}</option>
                      }
                    </select>
                  </td>
                } @else {
                  <td>
                    @if (t.stipendAmount > 0) {
                      {{ t.stipendAmount | peso }}
                    } @else {
                      <span class="font-bold text-[#8a5300]">Not set</span>
                    }
                  </td>
                  <td>{{ t.paymentFrequency }}</td>
                }
                <td>{{ t.scholarCount }}</td>
                <td>
                  <span class="font-bold" [style.color]="t.isActive ? '#17692c' : '#595959'">{{
                    t.isActive ? 'Active' : 'Inactive'
                  }}</span>
                </td>
                <td class="whitespace-nowrap">
                  @if (editing()?.id === t.id) {
                    <button
                      class="btn btn-brand !h-[26px] !px-2 !text-[12px]"
                      [disabled]="busy()"
                      (click)="saveEdit(t)"
                    >
                      Save
                    </button>
                    <button
                      class="btn btn-gray ml-1 !h-[26px] !px-2 !text-[12px]"
                      (click)="editing.set(null)"
                    >
                      Cancel
                    </button>
                  } @else {
                    <button
                      class="btn btn-outline !h-[26px] !px-2 !text-[12px]"
                      (click)="startEdit(t)"
                    >
                      Edit
                    </button>
                    @if (t.isActive) {
                      <button
                        class="btn btn-warn ml-1 !h-[26px] !px-2 !text-[12px]"
                        (click)="toggle(t, false)"
                      >
                        Deactivate
                      </button>
                    } @else {
                      <button
                        class="btn btn-ok ml-1 !h-[26px] !px-2 !text-[12px]"
                        (click)="toggle(t, true)"
                      >
                        Activate
                      </button>
                    }
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="!py-6 text-center text-[#595959]">
                  No scholarship types match
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <h3 class="section-title mt-5">Add New Scholarship</h3>
      <form class="grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_auto]" (ngSubmit)="add()" #f="ngForm">
        <div>
          <label class="field-label">Name</label
          ><input class="input" name="n" [(ngModel)]="name" required maxlength="150" />
        </div>
        <div>
          <label class="field-label">Stipend Amount</label
          ><input
            class="input"
            type="number"
            min="0.01"
            step="0.01"
            name="a"
            [(ngModel)]="amount"
            required
          />
        </div>
        <div>
          <label class="field-label">Frequency</label>
          <select class="input" name="f" [(ngModel)]="frequency">
            @for (x of freqs; track x) {
              <option>{{ x }}</option>
            }
          </select>
        </div>
        <div class="flex items-end">
          <button class="btn btn-brand" type="submit" [disabled]="busy()">Add Scholarship</button>
        </div>
      </form>
    </app-modal>
  `,
})
export class ScholarshipTypesDialog implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  // Events sent back to the Scholars page: "closed" (hide me) and "changed" (reload your list).
  closed = output<void>();
  changed = output<void>();
  types = signal<ScholarshipType[]>([]);
  busy = signal(false);
  freqs = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual'];
  // Search box: filters the table by name or fund source.
  query = signal('');
  shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.types().filter(
      (t) =>
        !q || t.name.toLowerCase().includes(q) || (t.fundSource ?? '').toLowerCase().includes(q),
    );
  });
  // Types that cannot be paid yet because their stipend amount is 0.
  unset = computed(() => this.types().filter((t) => t.isActive && !(t.stipendAmount > 0)).length);
  // The row being edited (null = none) and its edit values.
  editing = signal<ScholarshipType | null>(null);
  editAmount: number | null = null;
  editFrequency = 'Monthly';
  name = '';
  amount: number | null = null;
  frequency = 'Monthly';

  ngOnInit(): void {
    void this.load();
  }
  async load(): Promise<void> {
    this.types.set(
      await firstValueFrom(this.api.get<ScholarshipType[]>('/admin/scholarship-types')),
    );
  }

  // Add a new type. Name and an amount above 0 are required.
  async add(): Promise<void> {
    if (!this.name.trim() || !this.amount || this.amount <= 0) {
      void this.dlg.warning('Invalid inputs');
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.post('/admin/scholarship-types', {
          name: this.name.trim(),
          stipendAmount: this.amount,
          paymentFrequency: this.frequency,
        }),
      );
      this.name = '';
      this.amount = null;
      await this.load();
      this.changed.emit();
      void this.dlg.success('Added successfully!');
    } catch (e) {
      void this.dlg.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  // Activate or deactivate a type.
  async toggle(t: ScholarshipType, active: boolean): Promise<void> {
    // Ask first before hiding a type (scholars already on it keep it).
    if (
      !active &&
      !(await this.dlg.confirm(
        `Deactivate "${t.name}"?\n\nIt will no longer be offered for new scholars. ${t.scholarCount} active scholar${t.scholarCount === 1 ? '' : 's'} on it keep${t.scholarCount === 1 ? 's' : ''} it.`,
        'Deactivate scholarship',
        'Deactivate',
        'Cancel',
        true,
      ))
    )
      return;
    try {
      await firstValueFrom(
        this.api.post(`/admin/scholarship-types/${t.id}/${active ? 'activate' : 'deactivate'}`),
      );
      await this.load();
      this.changed.emit();
      void this.dlg.success(`"${t.name}" is now ${active ? 'active' : 'inactive'}.`);
    } catch (e) {
      void this.dlg.error(errorMessage(e));
    }
  }

  // Edit button: show inputs for the stipend amount and frequency on that row.
  startEdit(t: ScholarshipType): void {
    this.editing.set(t);
    this.editAmount = t.stipendAmount || null;
    this.editFrequency = t.paymentFrequency;
  }

  // Save the edited row (PUT /api/admin/scholarship-types/{id}). The new amount is used from the next payroll.
  async saveEdit(t: ScholarshipType): Promise<void> {
    if (!this.editAmount || this.editAmount <= 0) {
      void this.dlg.warning('Please enter a stipend amount above 0.');
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.put(`/admin/scholarship-types/${t.id}`, {
          name: t.name,
          stipendAmount: this.editAmount,
          paymentFrequency: this.editFrequency,
          fundSource: t.fundSource,
        }),
      );
      this.editing.set(null);
      await this.load();
      this.changed.emit();
      void this.dlg.success(
        `Saved. "${t.name}" now pays ${this.editAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${this.editFrequency.toLowerCase()}.`,
      );
    } catch (e) {
      void this.dlg.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
