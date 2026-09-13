import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nodeSchema, eventSchema, uiActionSchema } from '../src/a2ui.ts';
const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));
for (const fixture of fixtures) test(fixture.name, () => {
  const schema = fixture.kind === 'node' ? nodeSchema : eventSchema;
  assert.equal(schema.safeParse(fixture.value).success, fixture.valid);
  if (fixture.kind === 'event') assert.equal(uiActionSchema.safeParse({
    version: 'v0.9', action: { ...fixture.value, surfaceId: 'test', sourceComponentId: 'test', timestamp: '' },
  }).success, fixture.valid);
});
