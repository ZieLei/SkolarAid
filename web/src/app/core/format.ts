import { Pipe, PipeTransform } from '@angular/core';

export const STATUS_COLORS: Record<string, string> = {
  Active: '#28a745', Approved: '#28a745', Released: '#28a745', Complete: '#28a745', Submitted: '#007bff',
  Processed: '#ffaa00', Processing: '#ffaa00', Pending: '#ffaa00', 'Pending Approval': '#ffaa00', Incomplete: '#ffaa00', Probation: '#ffaa00',
  Rejected: '#ef4444', Overdue: '#dc2626', Failed: '#ef4444', Inactive: '#646464', Suspended: '#ef4444', Terminated: '#ef4444',
};
export const statusColor = (s: string | null | undefined): string => STATUS_COLORS[s ?? ''] ?? '#646464';

export const NOTIFICATION_COLORS: Record<string, string> = { Payment: '#28a745', Reminder: '#ffaa00', Alert: '#ef4444', Update: '#007bff', Announcement: '#9c27b0' };

export const toIso = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const v = typeof d === 'string' ? d : d.toISOString();
  return v.length === 10 ? v : v.slice(0, 10);
};
/** yyyy-MM-dd for <input type="date"> from an API date string. */
export const dateInput = (s: string | null | undefined): string => (s ? s.slice(0, 10) : '');
export const today = (): string => new Date().toISOString().slice(0, 10);
export const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export function relativeTime(iso: string): string {
  const mins = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${Math.floor(mins)}m ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 60 * 24 * 7) return `${Math.floor(mins / 60 / 24)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

/** Peso formatting: ₱1,234.50 */
@Pipe({ name: 'peso' })
export class PesoPipe implements PipeTransform {
  transform(v: number | null | undefined, digits = 2): string {
    return '₱' + (v ?? 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
}

@Pipe({ name: 'dmy' })
export class DatePipeShort implements PipeTransform {
  transform(v: string | null | undefined, fallback = '-'): string {
    if (!v) return fallback;
    const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }
}

@Pipe({ name: 'dt' })
export class DateTimePipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    if (!v) return '-';
    return new Date(v).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
