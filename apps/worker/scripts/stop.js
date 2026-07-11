/**
 * Worker停止スクリプト
 * PIDファイルからプロセスIDを読み取り、SIGTERMを送信する
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PID_FILE = join(__dirname, '..', 'worker.pid');

if (!existsSync(PID_FILE)) {
  console.log('[Stop] Workerは実行されていません');
  process.exit(0);
}

const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);

try {
  process.kill(pid, 'SIGTERM');
  console.log(`[Stop] Worker (PID: ${pid}) に停止シグナルを送信しました`);
} catch (err) {
  console.error(`[Stop] Worker (PID: ${pid}) の停止に失敗:`, err);
  process.exit(1);
}
