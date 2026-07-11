/**
 * ZENNOBATE DEV CORE — Local Worker
 *
 * 開発PCで常駐し、Firestoreからタスクを取得して
 * Antigravityワークフローを実行する。
 *
 * 機能:
 * - Firestoreリアルタイムリスナー
 * - タスク実行エンジン
 * - ヘルスチェック
 * - 重複実行防止
 * - 安全な停止
 * - 自動再接続
 */

import { createServer } from 'node:http';
import { writeFileSync, existsSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = parseInt(process.env['WORKER_PORT'] || '8787', 10);
const PID_FILE = join(import.meta.dirname || '.', '..', 'worker.pid');

/** 重複実行防止 */
function checkDuplicateInstance(): void {
  if (existsSync(PID_FILE)) {
    const existingPid = readFileSync(PID_FILE, 'utf-8').trim();
    try {
      // PIDが存在するか確認（シグナル0は何もしないが存在確認になる）
      process.kill(parseInt(existingPid, 10), 0);
      console.error(`[Worker] 別のインスタンスが既に実行中です (PID: ${existingPid})`);
      console.error('[Worker] 停止するには: npm run stop --workspace=apps/worker');
      process.exit(1);
    } catch {
      // プロセスが存在しない場合は古いPIDファイルを削除
      console.log('[Worker] 古いPIDファイルを削除します');
      unlinkSync(PID_FILE);
    }
  }
  writeFileSync(PID_FILE, process.pid.toString());
}

/** クリーンアップ */
function cleanup(): void {
  console.log('[Worker] 停止処理を開始...');
  try {
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }
  } catch {
    // 無視
  }
  console.log('[Worker] 停止完了');
  process.exit(0);
}

// シグナルハンドラ
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => {
  console.error('[Worker] 未捕捉の例外:', err);
  cleanup();
});

// 起動
checkDuplicateInstance();

/** Worker状態 */
interface WorkerState {
  status: 'idle' | 'processing' | 'error';
  currentTaskId: string | null;
  startedAt: string;
  lastHeartbeat: string;
  tasksProcessed: number;
  errors: number;
}

const state: WorkerState = {
  status: 'idle',
  currentTaskId: null,
  startedAt: new Date().toISOString(),
  lastHeartbeat: new Date().toISOString(),
  tasksProcessed: 0,
  errors: 0,
};

/** ヘルスチェック間隔 */
const HEALTH_INTERVAL = parseInt(process.env['WORKER_HEALTH_INTERVAL'] || '30', 10) * 1000;

setInterval(() => {
  state.lastHeartbeat = new Date().toISOString();
  // TODO: Firestoreにハートビートを送信
}, HEALTH_INTERVAL);

/** ヘルスチェックHTTPサーバー */
const healthServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    name: 'ZENNOBATE DEV CORE Worker',
    version: '0.1.0',
    pid: process.pid,
    ...state,
  }));
});

healthServer.listen(PORT, () => {
  console.log(`[Worker] ZENNOBATE DEV CORE Worker 起動完了`);
  console.log(`[Worker] PID: ${process.pid}`);
  console.log(`[Worker] ヘルスチェック: http://localhost:${PORT}`);
  console.log('[Worker] タスク待機中...');
});
