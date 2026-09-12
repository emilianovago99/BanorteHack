import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';
import type { Visualization } from '@banortehack/contracts';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

export { A2UIRenderer } from './renderer';

const colors = ['#df0030', '#163c40', '#e8a05a', '#78948c', '#b889ab', '#85a8c4', '#727c93', '#d1bda0', '#aeccd0', '#d77776', '#8b9375', '#b1b8c2'];

export function DatasetChart({ title, labels, series, type = 'bar' }: { title: string; labels: string[]; series: { label: string; values: number[] }[]; type?: 'bar' | 'line' | 'doughnut' }) {
  const data = { labels, datasets: series.map((item, index) => ({ label: item.label, data: item.values, backgroundColor: type === 'doughnut' ? colors : colors[index % colors.length], borderColor: colors[index % colors.length], borderWidth: type === 'line' ? 2 : 0, borderRadius: type === 'bar' ? 4 : 0, pointRadius: labels.length > 24 ? 0 : 2, tension: .28 })) };
  const options = { responsive: true, animation: false as const, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom' as const, labels: { usePointStyle: true, boxWidth: 8, padding: 18 } } } };
  return <section className="finance-panel"><div className="panel-heading"><h3>{title}</h3><span className="panel-unit">{type === 'doughnut' && series[0]?.label === '%' ? 'Distribución' : 'MXN'}</span></div>
    {labels.length ? <div className="chart-container">{type === 'line' ? <Line data={data} options={options} /> : type === 'doughnut' ? <Doughnut data={data} options={options} /> : <Bar data={data} options={options} />}</div> : <p className="empty-state">No hay movimientos para este periodo.</p>}
    <details className="chart-details"><summary>Ver datos de la gráfica</summary><table><thead><tr><th>Periodo / categoría</th>{series.map(item => <th key={item.label}>{item.label}</th>)}</tr></thead><tbody>{labels.map((label, i) => <tr key={`${label}-${i}`}><td>{label}</td>{series.map(item => <td key={item.label}>{item.values[i]?.toLocaleString('es-MX', { maximumFractionDigits: 2 })}</td>)}</tr>)}</tbody></table></details>
  </section>;
}

export function FinancialChart({ data }: { data?: Visualization | null }) {
  if (!data?.labels?.length || !data.values || data.labels.length !== data.values.length) {
    return null;
  }
  return <figure>
    <figcaption>{data.title}</figcaption>
    <Bar data={{ labels: data.labels, datasets: [{ label: 'MXN', data: data.values, backgroundColor: '#eb0029' }] }}
      options={{ responsive: true, plugins: { legend: { display: false } } }} />
    <table>
      <caption>Datos de la gráfica</caption>
      <thead><tr><th>Periodo</th><th>Monto (MXN)</th></tr></thead>
      <tbody>{data.labels.map((label, i) => <tr key={label}><td>{label}</td><td>{data.values[i]}</td></tr>)}</tbody>
    </table>
  </figure>;
}
