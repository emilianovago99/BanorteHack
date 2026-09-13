import { createApp } from './server.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
createApp().listen(port, host, () => console.log(`Lazy Bank API: http://${host}:${port}`));
