# アーキテクチャ設計書

## システム概要

ZENNOBATE DEV COREは、携帯端末から開発指示・承認を行い、
開発PCのAntigravityが実際の開発作業を実行する個人専用システム。

## コンポーネント構成

### 1. 携帯PWA (apps/web/)

- **技術**: Next.js + TypeScript
- **役割**: UI提供、操作の送信
- **通信**: Cloud API経由、FCMで通知受信
- **オフライン**: Service Workerで基本表示可能

### 2. Cloud API (apps/api/)

- **技術**: Node.js + Express/Hono on Cloud Run
- **役割**: 認証ゲートウェイ、Firestoreへの読み書き仲介
- **セキュリティ**: Firebase Auth IDトークン検証、メール許可リスト

### 3. Firebase

- **Authentication**: Googleログイン
- **Firestore**: タスク、状態、ログ、設定の永続化
- **Cloud Messaging**: プッシュ通知

### 4. Local Worker (apps/worker/)

- **技術**: Node.js常駐プロセス
- **役割**: Firestoreからタスク取得、Antigravityワークフロー実行
- **機能**: ヘルスチェック、重複実行防止、自動再接続、安全な停止

### 5. Antigravity Bridge (packages/antigravity-bridge/)

- **役割**: Antigravity IDE/CLIとの連携
- **機能**: スキル実行、プロジェクト記憶管理、Git操作

### 6. AI Provider Adapters (packages/providers/)

- **対応**: OpenAI, Anthropic, Google
- **機能**: モデル振り分け、フォールバック、コスト追跡

## データフロー

```
[携帯] → [Cloud API] → [Firestore] ← [Local Worker] → [Antigravity]
                                    →  [FCM] → [携帯]
```

### タスク実行フロー

1. ユーザーが携帯からタスク作成
2. Cloud APIがFirestoreにタスク登録 (QUEUED)
3. Local WorkerがFirestoreの変更を検知
4. Worker: QUEUED → ANALYZING (プロジェクト解析)
5. Worker: ANALYZING → PLANNING (計画作成)
6. Worker: PLANNING → WAITING_FOR_PLAN_APPROVAL (承認待ち)
7. FCM通知 → ユーザーが携帯で計画承認
8. Worker: WAITING_FOR_PLAN_APPROVAL → IMPLEMENTING (実装)
9. Worker: IMPLEMENTING → TESTING (テスト)
10. Worker: TESTING → REVIEWING (別モデルレビュー)
11. Worker: REVIEWING → WAITING_FOR_CHANGE_APPROVAL (承認待ち)
12. FCM通知 → ユーザーが携帯で変更承認
13. Worker: WAITING_FOR_CHANGE_APPROVAL → READY_TO_DEPLOY
14. 必要に応じて WAITING_FOR_DEPLOY_APPROVAL → DEPLOYING → COMPLETED

### PCオフライン時

- タスクはFirestoreにQUEUED状態で保存
- 携帯に「開発PC待機中」と表示
- PCオンライン復帰後にWorkerが自動取得・処理再開

## Firestoreスキーマ

```
projects/{projectId}
  name, description, repoUrl, createdAt

projects/{projectId}/tasks/{taskId}
  title, description, status, assignedModel
  branch, priority, createdAt, updatedAt
  plan, testResults, reviewResults
  costs, approvals, attachments

projects/{projectId}/tasks/{taskId}/logs/{logId}
  timestamp, level, message, source, details

users/{userId}
  email, displayName, role, createdAt

config/models
  openai, anthropic, google (model IDs and settings)

config/limits
  taskCostLimit, monthlyCostLimit, monthlyUsage

audit/{auditId}
  userId, action, target, result, timestamp
```

## セキュリティアーキテクチャ

### 認証レイヤー

1. Firebase Auth (Googleログイン)
2. IDトークン検証 (Cloud API)
3. メール許可リスト (Cloud API)
4. JWTトークン (Local Worker ↔ Cloud API)

### データ保護

- APIキー: Secret Manager / ローカル .env
- 通信: すべてHTTPS
- Firestore: セキュリティルールで制限
- Local Worker: ワークスペース外アクセス禁止

### 操作制限

- 必須承認操作リスト (approval-checker)
- コマンド許可/拒否リスト (command-guard)
- ファイルアクセス制限 (path-guard)
- 入力サニタイズ (input-sanitizer)
- 監査ログ (audit-log)
