import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import type { Visualization } from '@banortehack/contracts';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

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
