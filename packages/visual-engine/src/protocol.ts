import { z } from 'zod';
import { CATALOG_ID, messageSchema, type A2UINode, type A2UIEvent } from '@lazy-bank/contracts';
export { CATALOG_ID };
export type Node = A2UINode;
export type Event = A2UIEvent;
const numeric = z.number().finite();
export const seriesSchema = z.object({ labels: z.array(z.string()).max(200), series: z.array(z.object({ label: z.string(), values: z.array(numeric).max(200) })).max(5) });
export function parseSurface(messages: unknown[]) {
  if (messages.length > 12) throw new Error('Demasiados mensajes.');
  let surfaceId = '';
  let model: Record<string, unknown> = {};
  const nodes = new Map<string, Node>();
  for (const raw of messages) {
    const message = messageSchema.parse(raw);
    if ('createSurface' in message) { if (surfaceId) throw new Error('Superficie duplicada.'); surfaceId = message.createSurface.surfaceId; }
    if ('updateDataModel' in message) { if (!surfaceId || surfaceId !== message.updateDataModel.surfaceId) throw new Error('Superficie inválida.'); model = message.updateDataModel.value; }
    if ('updateComponents' in message) { if (!surfaceId || surfaceId !== message.updateComponents.surfaceId) throw new Error('Superficie inválida.'); for (const node of message.updateComponents.components) { if (nodes.has(node.id)) throw new Error('Componente duplicado.'); nodes.set(node.id, node); } }
  }
  if (!nodes.has('root')) throw new Error('Falta root.');
  // Validar referencias y ciclos antes de crear elementos React.
  function visit(id: string, parents: string[]) { if (parents.includes(id) || parents.length > 20) throw new Error('Árbol inválido.'); const node = nodes.get(id); if (!node) throw new Error('Referencia inválida.'); for (const child of ('children' in node ? node.children : [])) visit(child, [...parents, id]); }
  visit('root', []);
  return { surfaceId, model, nodes };
}

