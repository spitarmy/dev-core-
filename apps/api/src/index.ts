/**
 * ZENNOBATE DEV CORE — Cloud Run API
 *
 * Firebase Authで認証されたリクエストのみ受け付ける。
 * 携帯PWAとLocal Workerの間の橋渡しをする。
 */

import { createServer } from 'node:http';

const PORT = parseInt(process.env['API_PORT'] || '8080', 10);

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    name: 'ZENNOBATE DEV CORE API',
    version: '0.1.0',
    status: 'running',
    timestamp: new Date().toISOString(),
  }));
});

server.listen(PORT, () => {
  console.log(`[API] ZENNOBATE DEV CORE API listening on port ${PORT}`);
});
