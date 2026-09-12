export type FinancialDomain = 'deudas' | 'ingresos' | 'inversiones';
export type FinancialAction = 'invertir' | 'pagar' | 'transferir';

// Contrato interno del prototipo. No implementa todavía el protocolo A2UI.
export interface Visualization {
  type: 'bar';
  title: string;
  labels: string[];
  values: number[];
}

export interface ChatResponse {
  message: string;
  domain: FinancialDomain;
  mode: 'demo';
  visualization: Visualization;
}

export interface AccountSummary {
  balance: number;
  currency: 'MXN';
  mode: 'demo';
}
