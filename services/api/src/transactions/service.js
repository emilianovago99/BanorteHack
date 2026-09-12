const actions = new Set(['invertir', 'pagar', 'transferir']);

export function previewTransaction({ action, amount } = {}) {
  if (!actions.has(action) || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    throw new Error('Se requiere una acción válida y un monto entre 0 y 1,000,000 MXN.');
  }
  return {
    action, amount, currency: 'MXN', status: 'preview', mode: 'demo',
    message: `Vista previa: ${action} $${amount.toFixed(2)} MXN. No se ejecutó ningún movimiento.`
  };
}
