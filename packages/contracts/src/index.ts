export type FinancialDomain = 'resumen' | 'deudas' | 'ingresos' | 'gastos' | 'inversiones' | 'presupuestos' | 'movimientos' | 'suscripciones';
export type FinancialAction = 'invertir' | 'pagar' | 'transferir';

// Resumen de gráfica para clientes que no renderizan el catálogo completo.
export interface Visualization {
  type: 'bar' | 'line' | 'doughnut';
  title: string;
  labels: string[];
  values: number[];
}

export interface ChatResponse {
  message: string;
  domain: FinancialDomain;
  mode: 'demo';
  visualization: Visualization;
  a2ui: unknown[];
  surface_id: string;
  tools_used: string[];
  interpretation: 'gemini' | 'local';
  source: string;
  period?: string | null;
  simulation?: { plan_id: 'conservative' | 'balanced' | 'growth'; amount: number; months: number; monthly_contribution: number } | null;
}

export interface AccountSummary {
  balance: number;
  currency: 'MXN';
  mode: 'demo';
  month?: string;
  income?: number;
  expenses?: number;
  surplus?: number;
  dataset?: { start_date: string; end_date: string; transaction_count: number; profile: string };
}

export interface UIAction {
  version: 'v0.9';
  action: { name: string; surfaceId: string; sourceComponentId: string; timestamp: string; context: Record<string, unknown> };
}

export interface PublicConfig {
  auth: {
    mode: 'required' | 'demo';
    issuer: string;
    audience: string;
    webClientId: string;
    mobileClientId: string;
  };
  voice: { enabled: boolean };
}
