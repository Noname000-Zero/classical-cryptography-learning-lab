import { createApp } from './app.js';
const { app, close } = createApp();
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, '127.0.0.1', () => console.log(`Football Learning Academy: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => server.close(() => { close(); process.exit(0); }));
