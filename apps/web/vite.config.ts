import { defineConfig, type ProxyOptions } from 'vite';

const apiProxy: ProxyOptions = {
  target: 'http://127.0.0.1:3001',
  timeout: 4000,
  configure: proxy => {
    proxy.on('error', (_error, _req, res) => {
      if ('writeHead' in res && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'La API no está disponible. Ejecuta npm run dev:api.' }));
      }
    });
  }
};

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  server: { port: 5173, proxy: { '/api': apiProxy } }
});
