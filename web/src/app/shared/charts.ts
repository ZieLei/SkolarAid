// =====================================================================
// charts.ts - ready-made Chart.js settings (pie, line, bar) used by the
// admin dashboard and the Reports page.
// =====================================================================
import type { Chart, ChartConfiguration } from 'chart.js';

/** Colours used by the WinForms charts (teal first, then the Material-ish series colours). */
export const CHART_COLORS = ['#00444f', '#2196f3', '#4caf50', '#ff9800', '#9c27b0', '#e91e63', '#009688', '#795548'];

/** chart.js is loaded lazily so it only costs pages that draw charts. */
export async function makeChart(canvas: HTMLCanvasElement, config: ChartConfiguration): Promise<Chart> {
  const { Chart } = await import('chart.js/auto');
  return new Chart(canvas, config);
}

export const pieConfig = (labels: string[], data: number[]): ChartConfiguration => ({
  type: 'pie',
  data: { labels, datasets: [{ data, backgroundColor: CHART_COLORS, borderColor: '#fff', borderWidth: 2 }] },
  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 14, font: { family: 'Inter, system-ui, Arial, sans-serif', size: 12 } } } } },
});

/** "Bachelor of Science in Tourism Management" -> "BS Tourism Management", so bar labels fit and stay distinguishable. */
export function shortCourse(name: string): string {
  return name
    .replace(/^Bachelor of Science in Business Administration \(Major in (.+)\)$/, 'BSBA, $1')
    .replace(/^Bachelor of Secondary Education \(Major in (.+)\)$/, 'BSEd, $1')
    .replace(/^Bachelor of Elementary Education \((.+)\)$/, 'BEEd ($1)')
    .replace(/^Bachelor of Science in /, 'BS ');
}

export const lineConfig = (labels: string[], data: number[], label = 'Disbursed (₱)'): ChartConfiguration => ({
  type: 'line',
  data: { labels, datasets: [{ label, data, borderColor: '#00444f', backgroundColor: 'rgba(0,68,79,.12)', fill: true, tension: 0, pointRadius: 4, pointBackgroundColor: '#00444f' }] },
  options: {
    responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
    scales: { x: { grid: { color: '#e6e6e6' }, ticks: { color: '#505050' } }, y: { grid: { color: '#e6e6e6' }, ticks: { color: '#505050' }, beginAtZero: true } },
  },
});

export const barConfig = (labels: string[], data: number[], horizontal = true): ChartConfiguration => ({
  type: 'bar',
  data: { labels: labels.map(shortCourse), datasets: [{ data, backgroundColor: '#00444f', borderRadius: 4 }] },
  options: {
    responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
    plugins: { legend: { display: false }, tooltip: { callbacks: { title: (items) => labels[items[0].dataIndex] ?? '' } } },
    scales: { x: { grid: { color: '#e6e6e6' }, ticks: { color: '#505050', precision: 0 } }, y: { grid: { display: false }, ticks: { color: '#505050', autoSkip: false } } },
  },
});
