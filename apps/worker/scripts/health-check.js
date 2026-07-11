/**
 * Workerヘルスチェックスクリプト
 * ヘルスチェックエンドポイントに接続して状態を確認
 */
const PORT = process.env.WORKER_PORT || '8787';
const url = `http://localhost:${PORT}`;

fetch(url)
  .then(res => res.json())
  .then(data => {
    console.log('[Health] Worker状態:');
    console.log(JSON.stringify(data, null, 2));
    process.exit(data.status === 'error' ? 1 : 0);
  })
  .catch(() => {
    console.error('[Health] Workerに接続できません');
    console.error(`[Health] URL: ${url}`);
    process.exit(1);
  });
