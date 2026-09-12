import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
const localPython = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = existsSync(localPython) ? `"${localPython}"` : 'python';

export default defineConfig({
  testDir: './tests', timeout: 45000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5180', channel: process.platform === 'win32' ? 'msedge' : undefined, viewport: { width: 1600, height: 1000 }, screenshot: 'only-on-failure' },
  webServer: [
    { command: `${python} -m uvicorn app.main:app --app-dir services/ai --port 8001`, cwd: root, env: { AI_MODE: 'local' }, url: 'http://127.0.0.1:8001/health', timeout: 90000 },
    { command: 'node services/api/src/index.js', cwd: root, env: { AUTH_MODE: 'demo', HOST: '127.0.0.1', PORT: '3002', AI_SERVICE_URL: 'http://127.0.0.1:8001' }, url: 'http://127.0.0.1:3002/health', timeout: 30000 },
    { command: 'npm run dev --workspace @banortehack/web -- --host 127.0.0.1 --port 5180', cwd: root, env: { API_PROXY_TARGET: 'http://127.0.0.1:3002' }, url: 'http://127.0.0.1:5180', timeout: 30000 },
  ],
});
