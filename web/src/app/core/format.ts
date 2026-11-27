// =====================================================================
// format.ts - helpers that turn raw values into nice text:
// status colours, requirement names, dates, "5m ago", and pesos.
// The @Pipe classes are used in HTML templates, e.g. {{ amount | peso }}.
// =====================================================================
import { Pipe, PipeTransform } from '@angular/core';

// One colour per meaning, each >= 4.5:1 on white: amber = waiting, blue = in progress / received, green = done, red = problem.
const AMBER = '#8a5300',
  BLUE = '#0b5cad',
  GREEN = '#17692c',
  RED = '#b42318',
  GRAY = '#4b5563',
  PURPLE = '#6b2d8a';
export const STATUS_COLORS: Record<string, string> = {
  Active: GREEN,
  Approved: GREEN,
  Released: GREEN,
  Complete: GREEN,
  Completed: GREEN,
  Graduated: GREEN,
  Submitted: BLUE,
  Processed: BLUE,
  Processing: BLUE,
  Pending: AMBER,
  'Pending Approval': AMBER,
  Incomplete: AMBER,
  Probation: AMBER,
  Rejected: RED,
  Overdue: RED,
  Failed: RED,
  Suspended: RED,
  Terminated: RED,
  Expelled: RED,
  Dropped: RED,
  Inactive: GRAY,
  Withdrawn: GRAY,
};
// Colour for a status word; unknown words are gray.
export const statusColor = (s: string | null | undefined): string => STATUS_COLORS[s ?? ''] ?? GRAY;

// Colour for each notification type.
export const NOTIFICATION_COLORS: Record<string, string> = {
  Payment: GREEN,
  Reminder: AMBER,
  Alert: RED,
  Update: BLUE,
  Announcement: PURPLE,
};
// Icon for each notification type (names from shared/icon.ts).
export const NOTIFICATION_ICONS: Record<string, string> = {
  Payment: 'wallet',
  Reminder: 'wall-clock',
  Alert: 'alert',
  Update: 'info',
  Announcement: 'bell',
};
export const notificationIcon = (type: string, title = ''): string =>
  /payment|stipend/i.test(title) ? 'wallet' : (NOTIFICATION_ICONS[type] ?? 'bell');
// A very light background in the same colour, for status pills: "#17692c" -> "#17692c1a".
export const tint = (hex: string): string => hex + '1a';

/** Spell out abbreviations once, so "COR" / "COE" are never a mystery. Stored names are left unchanged. */
const REQUIREMENT_NAMES: Record<string, string> = {
  COR: 'Certificate of Registration (COR)',
  'Enrollment Form': 'Certificate of Enrollment (COE)',
  COE: 'Certificate of Enrollment (COE)',
  'PSA Birth Certificate': 'PSA Birth Certificate',
  Grades: 'Latest Grades / TOR',
};
export const requirementName = (t: string | null | undefined): string =>
  REQUIREMENT_NAMES[t ?? ''] ?? t ?? '';
@Pipe({ name: 'reqName' })
export class RequirementNamePipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    return requirementName(v);
  }
}

// Date -> "yyyy-MM-dd" (the format the API expects in URLs).
export const toIso = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const v = typeof d === 'string' ? d : d.toISOString();
  return v.length === 10 ? v : v.slice(0, 10);
};
/** yyyy-MM-dd for <input type="date"> from an API date string. */
export const dateInput = (s: string | null | undefined): string => (s ? s.slice(0, 10) : '');
// Today / n days ago as "yyyy-MM-dd" (default values for date filters).
// Uses the LOCAL date: toISOString() is UTC, which in the Philippines (UTC+8) gave yesterday's date before 8 AM.
const localIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = (): string => localIso(new Date());
export const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localIso(d);
};

// "Just now", "5m ago", "3h ago", "2d ago", or a normal date if older than a week.
export function relativeTime(iso: string): string {
  const mins = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${Math.floor(mins)}m ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 60 * 24 * 7) return `${Math.floor(mins / 60 / 24)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

/** One money format everywhere: ₱1,234.50 (always two decimals). */
export const formatPeso = (v: number | null | undefined, digits = 2): string =>
  '₱' +
  (v ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** Peso formatting: ₱1,234.50 */
@Pipe({ name: 'peso' })
export class PesoPipe implements PipeTransform {
  transform(v: number | null | undefined, digits = 2): string {
    return (
      '₱' +
      (v ?? 0).toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    );
  }
}

// {{ date | dmy }} -> "Mar 05, 2026" ("-" when empty).
@Pipe({ name: 'dmy' })
export class DatePipeShort implements PipeTransform {
  transform(v: string | null | undefined, fallback = '-'): string {
    if (!v) return fallback;
    const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }
}

// {{ date | dt }} -> "Mar 05, 2026, 09:30 AM".
@Pipe({ name: 'dt' })
export class DateTimePipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    if (!v) return '-';
    return new Date(v).toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
