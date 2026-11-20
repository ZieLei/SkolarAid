import { Receipt } from '../core/models';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fontUrl = (f: string): string => new URL(`fonts/NimbusSans-${f}.otf`, document.baseURI).href;
const fontFaces = (): string => `
  @font-face{font-family:'Nimbus Sans';src:url('${fontUrl('Regular')}');font-weight:400}
  @font-face{font-family:'Nimbus Sans';src:url('${fontUrl('Bold')}');font-weight:700}`;

const STYLE = `
  body{font-family:'Nimbus Sans',Arial,sans-serif;color:#222;margin:28px}
  .head{text-align:center;border-bottom:3px solid #00444f;padding-bottom:10px;margin-bottom:18px}
  .head h1{margin:0;color:#00444f;font-size:22px}.head p{margin:2px 0;font-size:12px;color:#555}
  h2{color:#00444f;font-size:18px;margin:14px 0 6px}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th{background:#00444f;color:#fff;text-align:left;padding:7px 9px}
  td{border-bottom:1px solid #ddd;padding:6px 9px}tr:nth-child(even) td{background:#f5fafa}
  .meta{font-size:12px;color:#555;margin-bottom:10px}
  .box{border:1px solid #00444f;border-radius:6px;padding:14px;margin:12px 0}
  .row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}.row b{color:#00444f}
  .amount{font-size:22px;font-weight:bold;color:#00444f}
  .sign{display:flex;justify-content:space-between;margin-top:56px}.sign div{width:42%;text-align:center;border-top:1px solid #333;padding-top:4px;font-size:12px}
  @media print{.noprint{display:none}}
`;

const header = (): string => `<div class="head"><h1>Legacy College of Compostela</h1><p>ScholarAid — Scholarship Management</p></div>`;

/** Prints through a hidden iframe (no popup blocker issues). In the print dialog choose "Save as PDF" to export. */
export function printHtml(title: string, body: string): void {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${fontFaces()}${STYLE}</style></head><body>${header()}${body}</body></html>`);
  doc.close();
  // Print exactly once: whichever of onload / the fallback timer fires first wins.
  let printed = false;
  const run = (): void => {
    if (printed) return;
    printed = true;
    try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } finally { setTimeout(() => frame.remove(), 2000); }
  };
  // Wait for the web font so the printout doesn't fall back to Arial; the timer is a safety net.
  frame.onload = () => { void (frame.contentDocument?.fonts?.ready ?? Promise.resolve()).then(run); };
  setTimeout(run, 1500);
}

export function reportHtml(title: string, columns: string[], rows: (string | null)[][]): string {
  return `<h2>${esc(title)}</h2><p class="meta">Generated ${esc(new Date().toLocaleString())} · ${rows.length} record(s)</p>
  <table><thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

const money = (n: number): string => '₱' + n.toLocaleString('en-US', { minimumFractionDigits: 2 });
const day = (s: string | null): string => (s ? new Date(s.length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' }) : '-');

export function receiptHtml(r: Receipt): string {
  const row = (k: string, v: string | null | undefined) => `<div class="row"><span>${esc(k)}</span><b>${esc(v || '-')}</b></div>`;
  return `<h2 style="text-align:center">DISBURSEMENT RECEIPT</h2><p class="meta" style="text-align:center">Reference: ${esc(r.referenceNumber)}</p>
  <div class="box">${row('Scholar Name', r.scholarName)}${row('Scholar Number', r.scholarNumber)}${row('Student ID', r.studentId)}${row('Course', r.course)}${row('Payment Period', r.period)}
  ${row('Payment Method', r.paymentMethod)}${row('Bank', [r.bankName, r.bankAccountNumber].filter(Boolean).join(' · '))}${row('Computation Date', day(r.computationDate))}${row('Release Date', day(r.releaseDate))}${row('Status', r.status)}${row('Processed By', r.processedBy)}</div>
  <div class="box"><div class="row"><span>AMOUNT</span><span class="amount">${money(r.amount)}</span></div><div class="row"><span>Amount in words</span><b>${esc(r.amountInWords)}</b></div></div>
  <div class="sign"><div>Received by (Scholar)</div><div>Authorized Signatory</div></div>`;
}

const TEMPLATES: Record<string, { columns: string[]; note: string }> = {
  'Scholar Census Report': { columns: ['Scholar #', 'Name', 'Course', 'Year', 'Scholarship', 'Status'], note: 'List of scholars for the reporting period.' },
  'Payroll Summary Report': { columns: ['Period', 'Total Payments', 'Total Amount', 'Status'], note: 'Summary of stipend payroll per period.' },
  'Compliance Report': { columns: ['Scholar #', 'Name', 'Requirement', 'Status', 'Due Date', 'Remarks'], note: 'Compliance status of scholars.' },
  'Payment History Report': { columns: ['Scholar #', 'Name', 'Period', 'Amount', 'Status', 'Release Date', 'Method'], note: 'Stipend payments released.' },
  'Activity Log Report': { columns: ['User', 'Action', 'Details', 'Timestamp'], note: 'System activity log.' },
  'Disbursement Voucher': { columns: ['Payee', 'Particulars', 'Reference', 'Amount'], note: 'Voucher for stipend disbursement.' },
  'Liquidation Report': { columns: ['Date', 'Particulars', 'Reference', 'Amount', 'Remarks'], note: 'Liquidation of released funds.' },
  'Stipend Release Form': { columns: ['Scholar #', 'Name', 'Period', 'Amount', 'Signature'], note: 'Acknowledgement of stipend release.' },
};
export const TEMPLATE_LIST = Object.keys(TEMPLATES);
export const TEMPLATE_ICONS: Record<string, string> = {
  'Scholar Census Report': 'chart', 'Payroll Summary Report': 'money', 'Compliance Report': 'task', 'Payment History Report': 'wallet',
  'Activity Log Report': 'note', 'Disbursement Voucher': 'invoice', 'Liquidation Report': 'file', 'Stipend Release Form': 'dollar',
};

export function templateHtml(name: string): string {
  const t = TEMPLATES[name];
  const blank = Array.from({ length: 12 }, () => `<tr>${t.columns.map(() => '<td>&nbsp;</td>').join('')}</tr>`).join('');
  return `<h2>${esc(name)}</h2><p class="meta">${esc(t.note)} Date: ____________________ Prepared by: ____________________</p>
  <table><thead><tr>${t.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${blank}</tbody></table>
  <div class="sign"><div>Prepared by</div><div>Approved by</div></div>`;
}
