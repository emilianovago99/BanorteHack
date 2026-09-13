import { z } from 'zod';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nodeSchema, eventSchema, messageSchema, CATALOG_ID } from '../src/a2ui.ts';
const catalog = { ...z.toJSONSchema(nodeSchema, { io: 'input', reused: 'ref' }), $id: CATALOG_ID };
const runtime = { node: catalog, event: z.toJSONSchema(eventSchema, { io: 'input', reused: 'ref' }), message: z.toJSONSchema(messageSchema, { io: 'input', reused: 'ref' }) };
for (const [path, value] of [
  ['../../visual-engine/catalog.json', catalog],
  ['../../../services/ai/app/a2ui_contract.json', runtime],
]) {
  const target = fileURLToPath(new URL(path, import.meta.url));
  const content = JSON.stringify(value, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) throw new Error('Contrato desactualizado: ' + target);
  } else writeFileSync(target, content);
}
