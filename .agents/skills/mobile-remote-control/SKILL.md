---
name: mobile-remote-control
description: >
  内部スキル。モバイルPWAからのコマンドを受信し、Antigravityの操作にマッピングする。
  スマートフォンからの開発ワークフロー制御を実現する。
---

# mobile-remote-control — モバイルリモート制御

> **種別:** 内部スキル
>
> モバイルPWAからのコマンドを受信し、Antigravityの操作にマッピングします。

---

## 概要

`mobile-remote-control` は、スマートフォンのPWA（Progressive Web App）から
ZENNOBATE DEV CORE のワークフローを制御するためのブリッジスキルです。

外出先や移動中でも、モバイルデバイスから開発の進捗確認やタスク指示が可能になります。

---

## アーキテクチャ

```
┌──────────────┐     ┌─────────────────┐     ┌───────────────────┐
│  Mobile PWA  │────▶│  Command Queue  │────▶│  Antigravity IDE  │
│ (スマートフォン) │     │  (メッセージ仲介)  │     │  (開発マシン)      │
└──────────────┘     └─────────────────┘     └───────────────────┘
       ▲                                              │
       │              ┌─────────────────┐             │
       └──────────────│  Response Queue  │◀────────────┘
                      │  (結果通知)       │
                      └─────────────────┘
```

---

## 対応コマンド

### ステータス系コマンド

| モバイルアクション | マッピング先 | 説明 |
|---|---|---|
| `status` | `/dev-status` | 現在のタスク状態を表示 |
| `progress` | プロジェクトメモリ参照 | 進捗率を確認 |
| `logs` | 最新ログの取得 | エラーログ等を確認 |
| `test-results` | テスト結果の取得 | 最新のテスト結果 |

### タスク制御系コマンド

| モバイルアクション | マッピング先 | 説明 |
|---|---|---|
| `approve` | デプロイ承認 | リリース承認（認証必須） |
| `reject` | 差し戻し | 変更の差し戻し |
| `pause` | タスク中断 | 進行中タスクの一時停止 |
| `resume` | `/dev-resume` | タスクの再開 |
| `cancel` | タスクキャンセル | タスクの中止 |

### 情報参照系コマンド

| モバイルアクション | マッピング先 | 説明 |
|---|---|---|
| `diff` | Git差分の表示 | 変更内容の確認 |
| `spec` | 仕様書の表示 | タスク仕様の確認 |
| `review` | レビュー結果の表示 | レビュー内容の確認 |
| `costs` | コスト情報 | トークン使用量・費用 |

### 簡易指示系コマンド

| モバイルアクション | マッピング先 | 説明 |
|---|---|---|
| `quick-fix {description}` | `/dev-fix` | 簡易的な修正指示 |
| `new-task {description}` | `/dev-plan` | 新規タスクの作成 |
| `note {text}` | メモの記録 | プロジェクトメモリにメモを追加 |

---

## コマンド処理フロー

### 受信から実行まで

```
1. モバイルPWAからコマンドを受信
   ↓
2. コマンドの解析とバリデーション
   ↓
3. 認証チェック（承認系コマンドの場合）
   ↓
4. Antigravity操作へのマッピング
   ↓
5. 実行
   ↓
6. 結果をモバイルPWAに送信
```

### コマンドメッセージ形式

```json
{
  "command": "status",
  "timestamp": "ISO8601",
  "device_id": "mobile-001",
  "auth_token": "...",
  "parameters": {},
  "priority": "normal | high"
}
```

### レスポンスメッセージ形式

```json
{
  "command": "status",
  "status": "success | error",
  "timestamp": "ISO8601",
  "data": {
    "current_task": {
      "id": "TASK-002",
      "title": "プロフィール編集",
      "progress": "75%",
      "phase": "testing",
      "model": "claude-fable-5"
    },
    "recent_events": [
      "テスト実行中: 35/43 パス",
      "2件のテスト失敗 — 自動修正試行 1/3"
    ]
  },
  "notification": {
    "title": "タスク進捗",
    "body": "TASK-002: テスト中 (75%)",
    "icon": "progress"
  }
}
```

---

## セキュリティ

### 認証

- すべてのコマンドに認証トークンが必要
- 承認系コマンド（`approve`, `reject`）は追加の認証が必要
- トークンの有効期限は24時間
- 不正なトークンは即座にリジェクト

### 権限レベル

| レベル | 許可されるコマンド |
|---|---|
| `viewer` | `status`, `progress`, `logs`, `test-results`, `diff`, `spec`, `review`, `costs` |
| `operator` | viewer + `pause`, `resume`, `cancel`, `note`, `quick-fix`, `new-task` |
| `admin` | operator + `approve`, `reject` |

### 制限事項

- 本番デプロイの承認は、追加の二要素認証が必要
- コマンドの実行レートは1分あたり10回まで
- 大量のログ取得は概要のみに制限

---

## プッシュ通知

### 通知トリガー

以下のイベントでモバイルにプッシュ通知を送信:

| イベント | 通知内容 | 優先度 |
|---|---|---|
| テスト完了 | 「テスト完了: 43/43 パス ✅」 | normal |
| テスト失敗 | 「テスト失敗: 2件のエラー ❌」 | high |
| レビュー完了 | 「レビュー完了: 承認 ✅」 | normal |
| 自動修正失敗 | 「自動修正失敗: 人間の対応が必要 🚨」 | high |
| デプロイ承認待ち | 「デプロイ承認を待っています 🚀」 | high |
| デプロイ完了 | 「デプロイ完了 ✅」 | normal |
| エラー発生 | 「エラー: {概要}」 | high |

### 通知設定

ユーザーが通知の種類と時間帯をカスタマイズ可能:

```json
{
  "notification_settings": {
    "enabled": true,
    "quiet_hours": { "start": "22:00", "end": "08:00" },
    "high_priority_override_quiet": true,
    "categories": {
      "test_results": true,
      "review_results": true,
      "deploy_requests": true,
      "errors": true,
      "progress_updates": false
    }
  }
}
```

---

## 注意事項

- モバイルからの操作はすべてログに記録する
- ネットワーク切断時はコマンドをキューに保持し、再接続時に送信
- モバイル画面はタスク情報の要約表示に最適化する（詳細はデスクトップで確認）
- バッテリー消費を考慮し、ポーリング間隔は最小1分
