// =====================================================================
// payroll.ts - Admin > Payroll Processing (/admin/payroll).
//
// How paying scholars works on this page:
// 1. Pick the pay cycle (From / To dates, or a quick button: Monthly, Quarterly, Semi-Annual, Annual).
//    A scholar is paid once per cycle, so the period must match their frequency (shown in the "Pays" column).
//    Filter the table, pick the payment method and the expected release date, tick the eligible scholars.
// 2. "Preview"  -> preview()    -> POST /api/admin/payroll/preview (nothing saved)
// 3. "Process"  -> process() shows a confirm box -> runProcess()
// -> POST /api/admin/payroll/process (payments become "Processed", with the expected release date)
// 4. "Release"  -> release() lists payments whose expected date has come -> runRelease()
// -> POST /api/admin/payroll/release (payments become "Released": the admin confirms the money went out)
//    "Change date" moves the expected release date of a Processed payment (POST .../payments/{id}/reschedule).
// The rules for who can be paid live in the API (PayrollService / PayrollRules).
// Live: reloads when payments or compliance change.
// =====================================================================
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RealtimeService, reloadOn } from '../../core/realtime';
import { Api, errorMessage } from '../../core/api';
import { DialogService } from '../../core/dialog';
import { ToastService } from '../../core/toast';
import { DatePipeShort, PesoPipe, statusColor, formatPeso } from '../../core/format';
import {
  DisbursementHistory,
  Option,
  PayrollCandidate,
  PayrollPreview,
  PayrollResult,
  PayrollStats,
  ProcessedPayment,
  ReleaseResult,
  ScholarFilters,
} from '../../core/models';
import { YEAR_LEVELS } from '../../core/options';
import { AppIcon } from '../../shared/icon';
import { Fact, FactGrid } from '../../shared/fact-grid';
import { Modal } from '../../shared/modal';
import { ScrollCue } from '../../shared/scroll-cue';
import { StatItem, StatStrip } from '../../shared/stat-strip';

// ---- Payment period helpers ----
type PresetId = 'month' | 'quarter' | 'semester' | 'year';
/** Local date -> "yyyy-MM-dd" (not toISOString, which would shift the day by the time zone). */
const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string): Date => new Date(s + 'T00:00:00');
/** The [from, to] dates of a period template, for the month of `from`. */
function presetRange(id: PresetId, from: string): [string, string] {
  const d = parse(from);
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (id) {
    case 'year':
      return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
    case 'quarter': {
      const q = Math.floor(m / 3) * 3;
      return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))];
    }
    case 'semester': {
      const h = m < 6 ? 0 : 6;
      return [iso(new Date(y, h, 1)), iso(new Date(y, h + 6, 0))];
    }
    default:
      return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  }
}
/** Mirrors PayrollRules.CalculateReleaseDate: 3 days after `today`, moved past Saturday and Sunday. */
export function defaultReleaseDate(today: Date = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return iso(d);
}
/** "2026-11-30" or "2026-11-30T00:00:00" -> "Nov 30, 2026". */
export const dayText = (s: string | null | undefined): string =>
  s
    ? parse(s.slice(0, 10)).toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      })
    : '—';
/** Mirrors PayrollRules.PeriodLabel in the API so the page shows the same text that gets saved. */
export function periodLabel(from: string, to: string): string {
  const s = parse(from),
    e = parse(to);
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  const dd = (d: Date) => String(d.getDate()).padStart(2, '0');
  if (s.getDate() === 1 && iso(e) === iso(new Date(s.getFullYear(), s.getMonth() + 1, 0)))
    return s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth())
    return `${mon(s)} ${dd(s)}-${dd(e)}, ${e.getFullYear()}`;
  if (s.getFullYear() === e.getFullYear())
    return `${mon(s)} ${dd(s)} - ${mon(e)} ${dd(e)}, ${e.getFullYear()}`;
  return `${mon(s)} ${dd(s)}, ${s.getFullYear()} - ${mon(e)} ${dd(e)}, ${e.getFullYear()}`;
}

@Component({
  selector: 'app-payroll',
  imports: [Modal, FactGrid, StatStrip, ScrollCue, AppIcon, FormsModule, PesoPipe, DatePipeShort],
  template: `
    <app-stat-strip [items]="cards()" />

    <details class="card group" [open]="helpOpen()" (toggle)="setHelp($any($event.target).open)">
      <summary
        class="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-[14px] font-semibold text-ink"
      >
        <app-icon name="info" class="h-5 w-5 text-accent"></app-icon>How payroll works
        <span class="ml-auto text-[12px] font-normal text-muted group-open:hidden">Show</span
        ><span class="ml-auto hidden text-[12px] font-normal text-muted group-open:inline"
          >Hide</span
        >
      </summary>
      <div class="grid gap-3 border-t border-line px-5 py-4 md:grid-cols-3">
        <div>
          <p class="mb-1 text-[13px] font-semibold text-brand">1 · Frequency and period</p>
          <p class="text-[13px] leading-snug text-[#333]">
            Each scholarship pays its stipend amount <b>once per cycle</b>: Monthly, Quarterly,
            Semi-Annual or Annual. The payment period is the cycle you are paying now, so it must
            match: a Semi-Annual scholar is paid for a <b>6-month</b> period, not one month. The
            amount is never multiplied or split.
          </p>
        </div>
        <div>
          <p class="mb-1 text-[13px] font-semibold text-brand">2 · Process, then release</p>
          <p class="text-[13px] leading-snug text-[#333]">
            <b>Process</b> creates the payments with an <b>expected release date</b> (3 working days
            away unless you choose another). <b>Release</b> is you confirming the money was handed
            out; nothing is released automatically. A period that has not started yet cannot be
            paid.
          </p>
        </div>
        <div>
          <p class="mb-1 text-[13px] font-semibold text-brand">
            3 · No double payments, no surprises
          </p>
          <p class="text-[13px] leading-snug text-[#333]">
            A payment is released <b>only once</b>, and a scholar cannot be paid again for days a
            payment already covers. If the money is late, use <b>Change</b> next to the payment to
            move its expected date; the scholar is told.
          </p>
        </div>
      </div>
    </details>

    <div class="card flex flex-wrap items-end gap-x-4 gap-y-3 p-5">
      <div class="min-w-[220px] flex-1">
        <label class="field-label-b">Search by Name/ID</label
        ><input
          class="input"
          [ngModel]="search()"
          (ngModelChange)="search.set($event); reloadSoon()"
        />
      </div>
      <div>
        <label class="field-label-b">Scholarship Type</label>
        <select
          class="input !w-[190px]"
          [ngModel]="typeId()"
          (ngModelChange)="typeId.set($event); load()"
        >
          <option [ngValue]="0">All Scholarships</option>
          @for (o of typeOptions(); track o.id) {
            <option [ngValue]="o.id">{{ o.name }}</option>
          }
        </select>
      </div>
      <div>
        <label class="field-label-b">Year Level</label>
        <select
          class="input !w-[140px]"
          [ngModel]="year()"
          (ngModelChange)="year.set($event); load()"
        >
          <option>All Year Levels</option>
          @for (y of years; track y) {
            <option>{{ y }}</option>
          }
        </select>
      </div>
      <div class="ml-auto flex flex-wrap gap-2">
        <button class="btn btn-accent" (click)="selectAll()">Select All Eligible</button
        ><button class="btn btn-gray" (click)="selected.set(new_set())">Clear Selection</button>
      </div>
    </div>

    <div class="card @container overflow-hidden">
      <!-- Top: what to pay (period, payout) and what it adds up to. Both rows share the same columns so the fields line up. -->
      <div class="grid gap-x-8 gap-y-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_250px]">
        <!-- This column is a container: the inline pay-cycle buttons only appear when it is wide enough (740px), otherwise they get their own row. -->
        <div class="@container flex min-w-0 flex-col gap-6">
          <fieldset>
            <legend class="section-title !mt-0 !mb-3">Payment period · the cycle being paid</legend>
            <div
              class="grid grid-cols-2 items-end gap-3 @min-[740px]:grid-cols-[repeat(2,176px)_minmax(0,1fr)]"
            >
              <div>
                <label class="field-label" for="ps">From</label
                ><input
                  id="ps"
                  class="input"
                  type="date"
                  [ngModel]="periodStart()"
                  (ngModelChange)="setPeriod($event, periodEnd())"
                />
              </div>
              <div>
                <label class="field-label" for="pe">To</label
                ><input
                  id="pe"
                  class="input"
                  type="date"
                  [min]="periodStart()"
                  [ngModel]="periodEnd()"
                  (ngModelChange)="setPeriod(periodStart(), $event)"
                />
              </div>
              <!-- One quick button per payment frequency: fills From / To from the month of "From". -->
              <div class="col-span-2 @min-[740px]:col-span-1">
                <span id="quick-period" class="field-label"
                  >Pay cycle <span class="font-normal text-muted">· fills the dates</span></span
                >
                <div
                  class="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap"
                  role="group"
                  aria-labelledby="quick-period"
                >
                  @for (p of presets; track p.id) {
                    <button
                      type="button"
                      class="btn btn-outline !h-[42px] !px-3 !text-[12px] lg:!h-[36px]"
                      [class.!bg-brand-soft]="activePreset() === p.id"
                      [class.!border-brand]="activePreset() === p.id"
                      [attr.aria-pressed]="activePreset() === p.id"
                      [attr.title]="presetTitle(p.id)"
                      (click)="applyPreset(p.id)"
                    >
                      {{ p.label }}
                    </button>
                  }
                </div>
              </div>
            </div>
            <p class="mt-3 text-[12px] leading-snug text-muted">
              A scholar is paid once per cycle, so the period must match their frequency: Monthly =
              1 month, Quarterly = 3, Semi-Annual = 6, Annual = 12. The <b>Pays</b> column shows
              each scholar's.
            </p>
          </fieldset>

          <div class="border-t border-line pt-6">
            <p class="section-title !mt-0 !mb-3">Payout</p>
            <div
              class="grid grid-cols-2 items-end gap-3 @min-[740px]:grid-cols-[repeat(2,176px)_minmax(0,1fr)]"
            >
              <div>
                <label class="field-label" for="pm">Payment method</label>
                <select
                  id="pm"
                  class="input"
                  [ngModel]="method"
                  (ngModelChange)="setMethod($event)"
                >
                  @for (m of methods; track m) {
                    <option>{{ m }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="field-label" for="rel">Expected release date</label>
                <input
                  id="rel"
                  class="input"
                  type="date"
                  [min]="todayIso"
                  [ngModel]="releaseDate()"
                  (ngModelChange)="releaseDate.set($event)"
                />
              </div>
            </div>
            <p class="mt-3 text-[12px] leading-snug text-muted">
              The expected release date is when the money should go out (default: 3 working days
              after processing). It is your schedule, not a promise: if it slips, move it with
              <b>Change</b> in the history.
            </p>
          </div>
        </div>

        <div
          class="flex flex-col justify-center rounded-xl bg-brand-soft px-5 py-4 text-center lg:self-start lg:text-right"
          aria-live="polite"
        >
          <p class="text-[12px] font-semibold uppercase tracking-wider text-muted">
            {{ selected().size }} selected · {{ periodLabel() }}
          </p>
          <p class="mt-1 text-[28px] font-bold leading-tight tracking-tight text-brand">
            {{ total() | peso }}
          </p>
        </div>
      </div>

      <!-- Bottom: the three steps, in order. -->
      <div class="border-t border-line bg-[#fafcfc] p-5">
        <div class="grid gap-3 @min-[820px]:grid-cols-3" role="group" aria-label="Payroll steps">
          <div class="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
            <span class="reg-n shrink-0">1</span>
            <button
              class="btn btn-gray !h-[40px] flex-1 !text-[14px]"
              [disabled]="busy() || !selected().size"
              [attr.title]="selected().size ? null : needSelection"
              (click)="preview()"
            >
              <app-icon name="analysis" class="h-5 w-5"></app-icon>Preview
            </button>
          </div>
          <div class="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
            <span class="reg-n shrink-0">2</span>
            <button
              class="btn btn-brand !h-[40px] flex-1 !text-[14px]"
              [disabled]="busy() || !selected().size"
              [attr.title]="selected().size ? null : needSelection"
              (click)="process()"
            >
              <app-icon name="dollar" class="h-5 w-5"></app-icon>Process Payroll
            </button>
          </div>
          <div class="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
            <span class="reg-n shrink-0">3</span>
            <button
              class="btn btn-outline !h-[40px] flex-1 !text-[14px]"
              [disabled]="busy() || !stats()?.readyForRelease"
              [attr.title]="stats()?.readyForRelease ? null : noRelease"
              (click)="release()"
            >
              <app-icon name="wallet" class="h-5 w-5"></app-icon>Release{{
                stats()?.readyForRelease ? ' (' + stats()!.readyForRelease + ' ready)' : ' payments'
              }}
            </button>
          </div>
        </div>
        @if (!selected().size || !stats()?.readyForRelease) {
          <div class="mt-3 space-y-1 text-[12px] text-muted">
            @if (!selected().size) {
              <p>Preview and Process are off until you tick at least one eligible scholar.</p>
            }
            @if (!stats()?.readyForRelease) {
              <p>{{ noRelease }}</p>
            }
          </div>
        }
      </div>
    </div>

    @if (notStarted()) {
      <div
        class="flex items-start gap-3 rounded-xl border-l-4 border-warn bg-[#fff8e6] px-4 py-3"
        role="status"
      >
        <app-icon name="alert" class="mt-[2px] h-5 w-5 shrink-0 text-[#8a5300]"></app-icon>
        <p class="text-[13px] text-[#333]">
          <b>This period starts on {{ dayText(periodStart()) }}</b
          >, so nobody can be paid for it yet. Payroll can only be processed for a period that has
          already started.
        </p>
      </div>
    }

    @if (noBankCount(); as n) {
      <div
        class="flex items-start gap-3 rounded-xl border-l-4 border-warn bg-[#fff8e6] px-4 py-3"
        role="status"
      >
        <app-icon name="alert" class="mt-[2px] h-5 w-5 shrink-0 text-[#8a5300]"></app-icon>
        <p class="text-[13px] text-[#333]">
          <b>{{ n }} {{ n === 1 ? 'scholar has' : 'scholars have' }} no bank details</b>, so they
          cannot be paid by Bank Transfer. Choose <b>Cash</b> or <b>Mobile Wallet</b> above, or add
          their bank name and account number in Scholar Management.
        </p>
      </div>
    }

    <section class="card overflow-hidden">
      <div scrollCue class="grid-wrap max-h-[620px]">
        <table class="dgrid roomy">
          <thead>
            <tr>
              <th class="w-[40px]"></th>
              <th>Scholar #</th>
              <th>Name</th>
              <th>Course</th>
              <th>Year</th>
              <th>Scholarship</th>
              <th>Stipend</th>
              <th>Pays</th>
              <th>Compliance</th>
              <th>Eligible</th>
            </tr>
          </thead>
          <tbody>
            @for (c of rows(); track c.id; let i = $index) {
              <tr [class.alt]="i % 2 === 1">
                <td>
                  <input
                    type="checkbox"
                    [disabled]="!c.isEligible"
                    [checked]="selected().has(c.id)"
                    (change)="toggle(c.id)"
                    [attr.aria-label]="'Select ' + c.fullName"
                  />
                </td>
                <td>{{ c.scholarNumber }}</td>
                <td class="font-bold">{{ c.fullName }}</td>
                <td class="wrap">{{ c.course }}</td>
                <td>{{ c.yearLevel }}</td>
                <td class="wrap">{{ c.scholarshipType }}</td>
                <td>{{ c.stipendAmount | peso }}</td>
                <td class="whitespace-nowrap">{{ c.frequency }}</td>
                <td>
                  <span class="font-bold" [style.color]="color(c.complianceStatus)">{{
                    c.complianceStatus
                  }}</span>
                </td>
                <td class="whitespace-nowrap">
                  @if (c.paymentStatus === 'Already Paid') {
                    <span class="font-bold text-[#4b5563]"
                      ><app-icon
                        name="checked"
                        class="mr-1 inline-flex h-4 w-4 align-[-3px]"
                      ></app-icon
                      >Already paid</span
                    >
                  } @else if (c.isEligible) {
                    <span class="font-bold text-ok"
                      ><app-icon
                        name="checked"
                        class="mr-1 inline-flex h-4 w-4 align-[-3px]"
                      ></app-icon
                      >Yes</span
                    >
                  } @else {
                    <span class="font-bold text-[#4b5563]">No</span>
                    <span class="text-[#4b5563]">&nbsp;· {{ reason(c) }}</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="10" class="!py-8 text-center text-[#595959]">No scholars found</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="card overflow-hidden">
      <h2 class="px-5 pt-4 text-[16px] font-semibold tracking-tight text-ink">
        Disbursement History — {{ periodLabel() }}
      </h2>
      <div scrollCue class="grid-wrap max-h-[300px] p-2">
        <table class="dgrid roomy">
          <thead>
            <tr>
              <th>Scholar</th>
              <th>Period</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Release</th>
              <th>Method</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            @for (h of history(); track h.id) {
              <tr [style.background]="h.status === 'Released' ? '#f0fff0' : ''">
                <td>{{ h.scholarName }}</td>
                <td>{{ h.period }}</td>
                <td>{{ h.amount | peso }}</td>
                <td>
                  <span class="font-bold" [style.color]="color(h.status)">{{ h.status }}</span>
                </td>
                <td class="whitespace-nowrap">
                  @if (h.status === 'Released') {
                    Released {{ h.releaseDate | dmy }}
                  } @else {
                    Expected {{ h.releaseDate | dmy: 'date not set' }}
                    @if (h.status === 'Processed') {
                      <button
                        type="button"
                        class="ml-2 text-[12px] font-semibold text-brand underline"
                        (click)="openReschedule(h.id, h.scholarName, h.period, h.releaseDate)"
                        [attr.aria-label]="
                          'Change the expected release date of ' + h.scholarName + ', ' + h.period
                        "
                      >
                        Change
                      </button>
                    }
                  }
                </td>
                <td>{{ h.paymentMethod }}</td>
                <td>{{ h.referenceNumber }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="!py-6 text-center text-[#595959]">
                  No payments for this period
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    @if (previewDlg(); as v) {
      <app-modal
        [title]="v.confirm ? 'Confirm payroll' : 'Payroll preview'"
        [width]="720"
        (closed)="previewDlg.set(null)"
      >
        <app-fact-grid [facts]="previewFacts(v.p)" />
        @if (v.p.alreadyPaid) {
          <div
            class="mt-4 flex items-start gap-3 rounded-lg border-l-4 border-warn bg-[#fff8e6] px-4 py-3"
            role="alert"
          >
            <app-icon name="alert" class="mt-[2px] h-5 w-5 shrink-0 text-[#8a5300]"></app-icon>
            <p class="text-[13px] text-[#333]">
              <b>{{ v.p.alreadyPaid }}</b> of the selected scholars already have a payment for
              {{ v.p.period }}. They will be skipped so nobody is paid twice.
            </p>
          </div>
        }
        <h3 class="section-title mt-4">Scholars in this batch</h3>
        <div scrollCue class="grid-wrap max-h-[280px] rounded border border-[#e6e6e6]">
          <table class="dgrid roomy">
            <thead>
              <tr>
                <th>Scholar</th>
                <th class="text-right">Amount</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              @for (l of v.p.lines; track l.scholarId; let i = $index) {
                <tr [class.alt]="i % 2 === 1">
                  <td class="font-bold">{{ l.fullName }}</td>
                  <td class="text-right">{{ l.amount | peso }}</td>
                  <td>
                    @if (l.alreadyPaid) {
                      <span class="font-bold text-[#8a5300]"
                        ><app-icon
                          name="alert"
                          class="mr-1 inline-flex h-4 w-4 align-[-3px]"
                        ></app-icon
                        >Skipped, already paid</span
                      >
                    } @else {
                      <span class="font-bold text-ok"
                        ><app-icon
                          name="checked"
                          class="mr-1 inline-flex h-4 w-4 align-[-3px]"
                        ></app-icon
                        >Will be paid</span
                      >
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          @if (v.confirm) {
            <button class="btn btn-gray !h-[40px]" (click)="previewDlg.set(null)">Cancel</button>
            <button class="btn btn-brand !h-[40px]" [disabled]="busy()" (click)="runProcess()">
              <app-icon name="dollar" class="h-5 w-5"></app-icon>Process {{ v.p.new }} payment{{
                v.p.new === 1 ? '' : 's'
              }}
            </button>
          } @else {
            <button class="btn btn-gray !h-[40px]" (click)="previewDlg.set(null)">Close</button>
            @if (v.p.new) {
              <button
                class="btn btn-brand !h-[40px]"
                (click)="previewDlg.set({ p: v.p, confirm: true })"
              >
                <app-icon name="dollar" class="h-5 w-5"></app-icon>Continue to process…
              </button>
            }
          }
        </div>
      </app-modal>
    }

    @if (processed(); as r) {
      <app-modal title="Payroll processed" [width]="520" (closed)="processed.set(null)">
        <div class="mb-4 flex items-center gap-3">
          <app-icon name="checked" class="h-[40px] w-[40px] text-ok"></app-icon>
          <p class="text-[14px] text-[#333]">
            {{ r.processed }} payment{{ r.processed === 1 ? ' is' : 's are' }} queued for release.
            Scholars were notified.
          </p>
        </div>
        <app-fact-grid [facts]="resultFacts(r)" />
        <div class="mt-5 flex justify-end">
          <button class="btn btn-brand !h-[40px]" (click)="processed.set(null)">Done</button>
        </div>
      </app-modal>
    }

    @if (releaseDlg(); as v) {
      <app-modal title="Release payments" [width]="720" (closed)="releaseDlg.set(null)">
        <app-fact-grid [facts]="releaseFacts(v.ready, v.total)" />
        <div class="mt-4 flex items-start gap-3 rounded-lg bg-[#eef8f8] px-4 py-3">
          <app-icon name="info" class="mt-[2px] h-5 w-5 shrink-0 text-accent"></app-icon>
          <p class="text-[13px] text-[#333]">
            <b>Releasing means you have handed out the money.</b> These payments become Released,
            today is recorded as the release date and each scholar is notified. It can't be undone,
            and a payment can only be released once. If the money isn't ready for someone yet, use
            <b>Change date</b> on their row: nothing is released automatically.
          </p>
        </div>
        <div scrollCue class="grid-wrap mt-4 max-h-[260px] rounded border border-[#e6e6e6]">
          <table class="dgrid roomy">
            <thead>
              <tr>
                <th>Scholar</th>
                <th>Period</th>
                <th class="text-right">Amount</th>
                <th>Method</th>
                <th>Expected</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (x of v.ready; track x.paymentId; let i = $index) {
                <tr [class.alt]="i % 2 === 1">
                  <td class="font-bold">{{ x.scholarName }}</td>
                  <td>{{ x.period }}</td>
                  <td class="text-right">{{ x.amount | peso }}</td>
                  <td>{{ x.paymentMethod }}</td>
                  <td class="whitespace-nowrap">
                    {{ x.releaseDate | dmy }}
                    @if (daysLate(x.releaseDate); as n) {
                      <span class="block text-[12px] font-semibold text-[#8a5300]"
                        >{{ n }} {{ n === 1 ? 'day' : 'days' }} late</span
                      >
                    }
                  </td>
                  <td class="text-right">
                    <button
                      type="button"
                      class="btn btn-outline !h-[30px] !px-3 !text-[12px]"
                      (click)="openReschedule(x.paymentId, x.scholarName, x.period, x.releaseDate)"
                      [attr.aria-label]="'Change date for ' + x.scholarName"
                    >
                      Change date
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button class="btn btn-gray !h-[40px]" (click)="releaseDlg.set(null)">Cancel</button>
          <button class="btn btn-brand !h-[40px]" [disabled]="busy()" (click)="runRelease()">
            <app-icon name="wallet" class="h-5 w-5"></app-icon>Release
            {{ v.ready.length }} payment{{ v.ready.length === 1 ? '' : 's' }}
          </button>
        </div>
      </app-modal>
    }

    @if (released(); as r) {
      <app-modal title="Payments released" [width]="480" (closed)="released.set(null)">
        <div class="mb-4 flex items-center gap-3">
          <app-icon name="checked" class="h-[40px] w-[40px] text-ok"></app-icon>
          <p class="text-[14px] text-[#333]">
            Scholars have been notified of their released stipends.
          </p>
        </div>
        <app-fact-grid [facts]="releasedFacts(r)" />
        <div class="mt-5 flex justify-end">
          <button class="btn btn-brand !h-[40px]" (click)="released.set(null)">Done</button>
        </div>
      </app-modal>
    }

    @if (reschedule(); as r) {
      <app-modal title="Change expected release date" [width]="460" (closed)="reschedule.set(null)">
        <p class="mb-1 text-[14px] text-[#333]">
          <b>{{ r.name }}</b> · {{ r.period }}
        </p>
        <p class="mb-4 text-[13px] text-muted">
          Currently expected {{ dayText(r.current) }}. Use this when the money won't be ready on
          time. The scholar is notified of the new date.
        </p>
        <label class="field-label-b" for="resched">New expected release date</label>
        <input id="resched" class="input" type="date" [min]="todayIso" [(ngModel)]="newDate" />
        <div class="mt-5 flex justify-end gap-2">
          <button class="btn btn-gray !h-[40px]" (click)="reschedule.set(null)">Cancel</button>
          <button
            class="btn btn-brand !h-[40px]"
            [disabled]="busy() || !newDate || newDate < todayIso"
            (click)="runReschedule()"
          >
            <app-icon name="calendar" class="h-5 w-5"></app-icon>Save new date
          </button>
        </div>
      </app-modal>
    }

    @if (noneReady()) {
      <app-modal title="Nothing to release yet" [width]="520" (closed)="noneReady.set(false)">
        <p class="mb-3 text-[14px] text-[#333]">A payment can be released when:</p>
        <ul class="mb-4 space-y-2 text-[14px]">
          <li class="flex items-center gap-2">
            <app-icon name="checked" class="h-5 w-5 text-ok"></app-icon>its status is Processed, and
          </li>
          <li class="flex items-center gap-2">
            <app-icon name="checked" class="h-5 w-5 text-ok"></app-icon>its expected release date is
            today or earlier.
          </li>
        </ul>
        <div class="flex items-start gap-3 rounded-lg bg-[#eef8f8] px-4 py-3">
          <app-icon name="wall-clock" class="mt-[2px] h-5 w-5 shrink-0 text-accent"></app-icon>
          <p class="text-[13px] text-[#333]">
            Each payment gets the expected release date you choose when processing (3 working days
            by default). The Disbursement History below shows each date, and <b>Change</b> moves it.
          </p>
        </div>
        <div class="mt-5 flex justify-end">
          <button class="btn btn-brand !h-[40px]" (click)="noneReady.set(false)">OK</button>
        </div>
      </app-modal>
    }
  `,
})
export class PayrollPage implements OnInit {
  private api = inject(Api);
  private dlg = inject(DialogService);
  private toast = inject(ToastService);
  readonly dayText = dayText;
  /** Today as yyyy-MM-dd (the earliest date a release can be set to). */
  readonly todayIso = iso(new Date());
  years = YEAR_LEVELS;
  methods = ['Bank Transfer', 'Cash', 'Mobile Wallet'];
  color = statusColor;
  rows = signal<PayrollCandidate[]>([]);
  history = signal<DisbursementHistory[]>([]);
  stats = signal<PayrollStats | null>(null);
  typeOptions = signal<Option[]>([]);
  // Ids of the ticked scholars.
  selected = signal<Set<number>>(new Set());
  search = signal('');
  typeId = signal(0);
  year = signal('All Year Levels');
  // The payment period: first and last day (yyyy-MM-dd). Starts as the current month.
  periodStart = signal(iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  periodEnd = signal(iso(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)));
  // Quick templates, based on the month of the "From" date.
  // One quick button per payment frequency: pick the cycle you are paying and From / To fill in.
  presets = [
    { id: 'month', label: 'Monthly' },
    { id: 'quarter', label: 'Quarterly' },
    { id: 'semester', label: 'Semi-Annual' },
    { id: 'year', label: 'Annual' },
  ] as const;
  method = 'Bank Transfer';
  // When the money should go out (sent with Process). Starts as 3 working days from today.
  releaseDate = signal(defaultReleaseDate());
  /** The "How payroll works" box: open the first time, then remember what the admin chose. */
  helpOpen = signal(
    ((): boolean => {
      try {
        return localStorage.getItem('payroll-help') !== 'closed';
      } catch {
        return true;
      }
    })(),
  );
  setHelp(open: boolean): void {
    this.helpOpen.set(open);
    try {
      localStorage.setItem('payroll-help', open ? 'open' : 'closed');
    } catch {
      /* storage unavailable */
    }
  }
  busy = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly needSelection = 'Select at least one eligible scholar in the table first.';
  readonly noRelease =
    'Release is off: no processed payment has reached its expected release date yet.';
  new_set(): Set<number> {
    return new Set<number>();
  }
  // "2026-03" from the month picker -> "2026-03-01" for the API, and "March 2026" for display.
  // Same label the API saves on each payment (PayrollRules.PeriodLabel), e.g. "March 2026" or "Mar 01-15, 2026".
  periodLabel = computed(() => periodLabel(this.periodStart(), this.periodEnd()));
  // Which template matches the current dates (to highlight its button).
  activePreset = computed(
    () =>
      this.presets.find((p) => {
        const r = presetRange(p.id, this.periodStart());
        return r[0] === this.periodStart() && r[1] === this.periodEnd();
      })?.id ?? null,
  );

  // A date was changed: keep end >= start, then reload the table and history for the new period.
  setPeriod(start: string, end: string): void {
    if (!start) return;
    if (!end || end < start) end = start;
    this.periodStart.set(start);
    this.periodEnd.set(end);
    void this.load();
    void this.loadHistory();
  }
  applyPreset(id: PresetId): void {
    const [s, e] = presetRange(id, this.periodStart());
    this.setPeriod(s, e);
  }
  /** Tooltip for a quick-period pill: the exact dates it will fill in, e.g. "Sets Nov 01 – Nov 30, 2026". */
  presetTitle(id: PresetId): string {
    const [s, e] = presetRange(id, this.periodStart());
    return `Sets ${periodLabel(s, e)}`;
  }
  // Sum of the stipends of the ticked scholars.
  total = computed(() =>
    this.rows()
      .filter((r) => this.selected().has(r.id))
      .reduce((s, r) => s + r.stipendAmount, 0),
  );
  /** A period that starts after today cannot be paid yet. */
  notStarted = computed(() => this.periodStart() > this.todayIso);
  /** Whole days between an expected release date and today (0 when it is today or later). */
  daysLate(date: string | null): number {
    if (!date) return 0;
    return Math.max(
      0,
      Math.round(
        (parse(this.todayIso).getTime() - parse(date.slice(0, 10)).getTime()) / 86_400_000,
      ),
    );
  }
  /** Why a scholar can't be selected, so "No" is never a dead end. */
  reason(c: PayrollCandidate): string {
    if (c.stipendAmount <= 0) return 'no stipend set';
    if (c.cycleProblem) return c.cycleProblem;
    if (c.complianceStatus !== 'Complete')
      return (
        'compliance ' +
        (c.complianceStatus === 'Pending Approval'
          ? 'awaiting approval'
          : c.complianceStatus.toLowerCase())
      );
    if (c.payoutProblem) return c.payoutProblem + ' (needed for Bank Transfer)';
    return 'scholar not active';
  }
  /** Scholars who would be eligible except that Bank Transfer has no bank details for them (drives the notice above the table). */
  noBankCount = computed(
    () =>
      this.rows().filter(
        (r) =>
          r.payoutProblem &&
          r.paymentStatus !== 'Already Paid' &&
          r.stipendAmount > 0 &&
          r.complianceStatus === 'Complete',
      ).length,
  );
  // Number cards at the top of the page.
  cards = computed<{ label: string; value: string; icon: string; small: boolean; hint?: string }[]>(
    () => [
      {
        label: 'Eligible Scholars',
        value: String(this.rows().filter((r) => r.isEligible).length),
        icon: 'user-groups',
        small: false,
        hint: `of ${this.rows().length} listed · the rest are already paid, on another pay cycle, need compliance approved or have no bank details`,
      },
      {
        label: 'Processed Today',
        value: String(this.stats()?.processedToday ?? 0),
        icon: 'dollar',
        small: false,
        hint: 'Payments processed today',
      },
    ],
  );

  constructor() {
    // Another admin (or tab) processed / released payments, or compliance changed eligibility.
    const rt = inject(RealtimeService);
    reloadOn([rt.paymentsChanged$, rt.complianceChanged$], () =>
      Promise.all([this.load(), this.loadHistory(), this.loadStats()]),
    );
  }

  // On open: load the scholarship filter, then the table, history and numbers.
  async ngOnInit(): Promise<void> {
    const f = await firstValueFrom(this.api.get<ScholarFilters>('/admin/scholars/filters'));
    this.typeOptions.set(f.scholarships);
    await Promise.all([this.load(), this.loadHistory(), this.loadStats()]);
  }

  // Wait 300 ms after the last filter change before reloading.
  reloadSoon(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 300);
  }

  // Load the candidates table. Un-tick anyone who is no longer in the list or no longer eligible.
  async load(): Promise<void> {
    try {
      this.rows.set(
        await firstValueFrom(
          this.api.get<PayrollCandidate[]>('/admin/payroll/candidates', {
            from: this.periodStart(),
            to: this.periodEnd(),
            scholarshipTypeId: this.typeId() || null,
            yearLevel: this.year(),
            search: this.search(),
            method: this.method,
          }),
        ),
      );
      this.selected.update(
        (s) => new Set([...s].filter((id) => this.rows().some((r) => r.id === id && r.isEligible))),
      );
    } catch (e) {
      void this.dlg.error(errorMessage(e));
    }
  }
  /** Changing the payment method re-checks who can be paid (Bank Transfer needs bank details). */
  setMethod(m: string): void {
    this.method = m;
    void this.load();
  }
  async loadHistory(): Promise<void> {
    this.history.set(
      await firstValueFrom(
        this.api.get<DisbursementHistory[]>('/admin/payroll/history', {
          from: this.periodStart(),
          to: this.periodEnd(),
        }),
      ),
    );
  }
  async loadStats(): Promise<void> {
    this.stats.set(await firstValueFrom(this.api.get<PayrollStats>('/admin/payroll/stats')));
  }

  // Tick / un-tick one scholar. selectAll() ticks every eligible one.
  toggle(id: number): void {
    this.selected.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  selectAll(): void {
    this.selected.set(
      new Set(
        this.rows()
          .filter((r) => r.isEligible)
          .map((r) => r.id),
      ),
    );
  }

  // The request body for preview / process: month, payment method, ticked ids.
  private body() {
    return {
      periodStart: this.periodStart(),
      periodEnd: this.periodEnd(),
      method: this.method,
      releaseDate: this.releaseDate() || null,
      scholarIds: [...this.selected()],
    };
  }

  // Which pop-up is open and what it shows (null = closed).
  previewDlg = signal<{ p: PayrollPreview; confirm: boolean } | null>(null);
  processed = signal<PayrollResult | null>(null);
  releaseDlg = signal<{ ready: ProcessedPayment[]; total: number } | null>(null);
  released = signal<ReleaseResult | null>(null);
  noneReady = signal(false);

  previewFacts(p: PayrollPreview): Fact[] {
    return [
      { icon: 'calendar', label: 'Period', value: p.period },
      { icon: 'wallet', label: 'Method', value: p.method },
      { icon: 'calendar', label: 'Expected release', value: dayText(p.releaseDate) },
      { icon: 'user-groups', label: 'Selected', value: String(p.selected) },
      { icon: 'checked', label: 'Will be paid', value: String(p.new), tone: 'ok' },
      ...(p.alreadyPaid
        ? [
            {
              icon: 'alert',
              label: 'Skipped (already paid)',
              value: String(p.alreadyPaid),
              tone: 'pending',
            } as Fact,
          ]
        : []),
      { icon: 'dollar', label: 'Total amount', value: formatPeso(p.totalAmount), tone: 'strong' },
    ];
  }
  resultFacts(r: PayrollResult): Fact[] {
    return [
      { icon: 'calendar', label: 'Period', value: r.period },
      { icon: 'wallet', label: 'Method', value: r.method },
      { icon: 'calendar', label: 'Expected release', value: dayText(r.releaseDate) },
      { icon: 'checked', label: 'Processed', value: String(r.processed), tone: 'ok' },
      ...(r.skipped
        ? [{ icon: 'alert', label: 'Skipped', value: String(r.skipped), tone: 'pending' } as Fact]
        : []),
      { icon: 'dollar', label: 'Total', value: formatPeso(r.total), tone: 'strong' },
      { icon: 'mail', label: 'Emails sent', value: String(r.emailsSent) },
    ];
  }
  releaseFacts(ready: ProcessedPayment[], total: number): Fact[] {
    return [
      {
        icon: 'user-groups',
        label: 'Scholars',
        value: String(new Set(ready.map((x) => x.scholarId)).size),
      },
      { icon: 'file', label: 'Payments', value: String(ready.length) },
      { icon: 'dollar', label: 'Total amount', value: formatPeso(total), tone: 'strong' },
    ];
  }
  releasedFacts(r: ReleaseResult): Fact[] {
    return [
      { icon: 'checked', label: 'Released', value: String(r.released), tone: 'ok' },
      { icon: 'dollar', label: 'Total', value: formatPeso(r.total), tone: 'strong' },
      { icon: 'mail', label: 'Emails sent', value: String(r.emailsSent) },
    ];
  }

  // Step 1 (optional): show what would be paid, without saving.
  async preview(): Promise<void> {
    try {
      this.previewDlg.set({
        p: await firstValueFrom(
          this.api.post<PayrollPreview>('/admin/payroll/preview', this.body()),
        ),
        confirm: false,
      });
    } catch (e) {
      void this.dlg.error(errorMessage(e));
    }
  }

  /** Step 2: show the batch for confirmation; nothing is paid until "Process" is pressed in the dialog. */
  async process(): Promise<void> {
    const pv = await firstValueFrom(
      this.api.post<PayrollPreview>('/admin/payroll/preview', this.body()),
    ).catch((e) => {
      void this.dlg.error(errorMessage(e));
      return null;
    });
    if (!pv) return;
    if (!pv.new) {
      void this.dlg.info(
        'All selected scholars already have payments for this period.',
        'No new payments',
      );
      return;
    }
    this.previewDlg.set({ p: pv, confirm: true });
  }

  // "Process" pressed in the confirm box: create the payments, then refresh everything.
  async runProcess(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await firstValueFrom(
        this.api.post<PayrollResult>('/admin/payroll/process', this.body()),
      );
      this.previewDlg.set(null);
      this.selected.set(new Set());
      await Promise.all([this.load(), this.loadHistory(), this.loadStats()]);
      this.processed.set(r);
    } catch (e) {
      void this.dlg.error(errorMessage(e), 'Processing error');
    } finally {
      this.busy.set(false);
    }
  }

  // Step 3: find payments ready for release and show them in a confirm box.
  async release(): Promise<void> {
    try {
      const ready = await firstValueFrom(
        this.api.get<ProcessedPayment[]>('/admin/payroll/ready-for-release'),
      );
      if (!ready.length) {
        this.noneReady.set(true);
        return;
      }
      this.releaseDlg.set({ ready, total: ready.reduce((t, x) => t + x.amount, 0) });
    } catch (e) {
      void this.dlg.error(errorMessage(e), 'Release error');
    }
  }

  // "Release" pressed in the confirm box: release them all, then refresh.
  async runRelease(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.post<ReleaseResult>('/admin/payroll/release', {}));
      this.releaseDlg.set(null);
      await Promise.all([this.load(), this.loadHistory(), this.loadStats()]);
      this.released.set(r);
    } catch (e) {
      void this.dlg.error(errorMessage(e), 'Release error');
    } finally {
      this.busy.set(false);
    }
  }

  // ---- Change the expected release date of a payment that is still Processed ----
  reschedule = signal<{ id: number; name: string; period: string; current: string | null } | null>(
    null,
  );
  newDate = '';
  openReschedule(id: number, name: string, period: string, current: string | null): void {
    const cur = current?.slice(0, 10) ?? '';
    this.newDate = cur >= this.todayIso ? cur : this.todayIso;
    this.reschedule.set({ id, name, period, current });
  }
  async runReschedule(): Promise<void> {
    const r = this.reschedule();
    if (!r) return;
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.post(`/admin/payroll/payments/${r.id}/reschedule`, { releaseDate: this.newDate }),
      );
      this.reschedule.set(null);
      await Promise.all([this.loadHistory(), this.loadStats()]);
      // If the release box is open, refresh it: the payment may no longer be due.
      if (this.releaseDlg()) {
        const ready = await firstValueFrom(
          this.api.get<ProcessedPayment[]>('/admin/payroll/ready-for-release'),
        );
        this.releaseDlg.set(
          ready.length ? { ready, total: ready.reduce((t, x) => t + x.amount, 0) } : null,
        );
      }
      this.toast.show(
        `Expected release moved to ${dayText(this.newDate)}. ${r.name} was notified.`,
      );
    } catch (e) {
      void this.dlg.error(errorMessage(e), 'Could not change the date');
    } finally {
      this.busy.set(false);
    }
  }
}
