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
  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { family: 'Nimbus Sans, Arial, sans-serif', size: 11 } } } } },
});

export const lineConfig = (labels: string[], data: number[], label = 'Disbursed (₱)'): ChartConfiguration => ({
  type: 'line',
  data: { labels, datasets: [{ label, data, borderColor: '#00444f', backgroundColor: 'rgba(0,68,79,.12)', fill: true, tension: 0.3, pointBackgroundColor: '#00444f' }] },
  options: {
    responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
    scales: { x: { grid: { color: '#e6e6e6' }, ticks: { color: '#505050' } }, y: { grid: { color: '#e6e6e6' }, ticks: { color: '#505050' }, beginAtZero: true } },
  },
});

export const barConfig = (labels: string[], data: number[], horizontal = true): ChartConfiguration => ({
  type: 'bar',
  data: { labels, datasets: [{ data, backgroundColor: CHART_COLORS, borderRadius: 4 }] },
  options: {
    responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x', plugins: { legend: { display: false } },
    scales: { x: { grid: { color: '#e6e6e6' }, ticks: { color: '#505050', precision: 0 } }, y: { grid: { display: false }, ticks: { color: '#505050', callback: function (v) { const t = String(this.getLabelForValue(Number(v))); return t.length > 28 ? t.slice(0, 26) + '…' : t; } } } },
  },
});
