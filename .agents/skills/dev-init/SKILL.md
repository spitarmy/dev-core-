---
name: dev-init
description: >
  プロジェクト初期化スキル。プロジェクト構造・技術スタック・目的・既存機能・危険ゾーンを解析し、
  .devcore/ ディレクトリにメモリファイルを作成する。/dev-init スラッシュコマンドで起動。
---

# dev-init — プロジェクト初期化

> **スラッシュコマンド:** `/dev-init`
>
> プロジェクトを解析し、ZENNOBATE DEV CORE のワーキングメモリを初期化します。

---

## 概要

`/dev-init` は、プロジェクトの初回セットアップ時に実行するコマンドです。
プロジェクトのコードベースを自動解析し、以下の情報を `.devcore/` ディレクトリに保存します。

---

## 実行手順

### Step 1: プロジェクト構造の解析

1. ワークスペースのルートディレクトリを特定する
2. ディレクトリ構造を再帰的にスキャンする（`node_modules`, `.git`, `dist`, `build` 等は除外）
3. 以下を識別する:
   - **言語・フレームワーク**: `package.json`, `requirements.txt`, `Gemfile`, `go.mod` 等から判定
   - **ビルドツール**: webpack, vite, esbuild, turbopack 等
   - **テストフレームワーク**: jest, vitest, pytest, rspec 等
   - **CI/CD**: `.github/workflows/`, `cloudbuild.yaml`, `Dockerfile` 等
   - **データベース**: マイグレーションファイル、ORM設定、スキーマファイル
   - **認証**: OAuth, JWT, Session 等の認証実装

### Step 2: 技術スタック情報の記録

```json
// .devcore/tech-stack.json
{
  "source": "ai-inferred",
  "analyzed_at": "ISO8601タイムスタンプ",
  "languages": [
    { "name": "TypeScript", "version": "5.x", "confidence": "high" }
  ],
  "frameworks": [
    { "name": "Next.js", "version": "14.x", "confidence": "high" }
  ],
  "databases": [
    { "name": "PostgreSQL", "confidence": "medium", "note": "[AI推測] Prismaスキーマから推測" }
  ],
  "infrastructure": {
    "hosting": "Google Cloud Run",
    "ci_cd": "GitHub Actions",
    "confidence": "medium"
  }
}
```

### Step 3: 既存機能の識別

プロジェクト内の主要機能をリストアップする:

1. **ルーティング解析**: API routes / ページルートを抽出
2. **コンポーネント解析**: 主要UIコンポーネントを識別
3. **ビジネスロジック**: サービス層・ユースケースを特定
4. **外部連携**: API呼び出し先・Webhook・通知サービスを検出

```json
// .devcore/features.json
{
  "source": "ai-inferred",
  "features": [
    {
      "name": "ユーザー認証",
      "type": "authentication",
      "files": ["src/auth/", "src/middleware/auth.ts"],
      "status": "active",
      "confidence": "high"
    }
  ],
  "api_routes": [
    { "method": "POST", "path": "/api/auth/login", "file": "src/app/api/auth/login/route.ts" }
  ]
}
```

### Step 4: 危険ゾーンの特定

以下を「危険ゾーン」として記録する:

- **本番環境設定ファイル**: `.env.production`, deployment configs
- **認証・セキュリティ関連**: 認証ミドルウェア、暗号化処理
- **データベースマイグレーション**: スキーマ変更は破壊的変更のリスク
- **決済・課金処理**: 金銭に関わるロジック
- **共有ライブラリ**: 他プロジェクトから参照されるコード
- **インフラ設定**: Terraform, CloudFormation, Docker設定

```json
// .devcore/danger-zones.json
{
  "source": "ai-inferred",
  "zones": [
    {
      "path": "src/payments/",
      "risk_level": "critical",
      "reason": "決済処理 — 変更時は必ず人間レビュー必須",
      "requires_human_approval": true
    },
    {
      "path": "prisma/migrations/",
      "risk_level": "high",
      "reason": "DBスキーマ変更 — ロールバック手順を事前に準備",
      "requires_human_approval": true
    }
  ]
}
```

### Step 5: プロジェクトメモリの初期化

`.devcore/` ディレクトリに以下のファイルを作成:

| ファイル | 説明 |
|---|---|
| `project-summary.json` | プロジェクト概要・目的 |
| `tech-stack.json` | 技術スタック情報 |
| `features.json` | 既存機能リスト |
| `danger-zones.json` | 危険ゾーン一覧 |
| `coding-rules.json` | コーディング規約（既存のlint設定等から抽出） |
| `current-task.json` | 現在進行中タスク（初期値: null） |
| `task-history.json` | タスク履歴（初期値: 空配列） |
| `model-usage.json` | モデル使用履歴（初期値: 空配列） |

### Step 6: 結果の報告

初期化完了後、以下をユーザーに報告する:

1. **検出サマリー**: 言語・フレームワーク・主要機能の一覧
2. **危険ゾーン**: 変更時に注意が必要な箇所
3. **AI推測箇所**: `[AI推測]` タグが付いた項目のリスト — 人間に確認を求める
4. **推奨事項**: 不足している設定やベストプラクティスの提案

---

## AI推測 vs 人間決定の区別

すべてのメモリファイルで以下のルールを適用する:

- `"source": "ai-inferred"` — AIが解析・推測した情報
- `"source": "human-decided"` — 人間が明示的に決定・確認した情報
- `"source": "mixed"` — 一部AIが推測し、人間が確認済み

ユーザーが情報を確認・修正した場合は、該当フィールドの `source` を `"human-decided"` に更新する。

---

## 注意事項

- `.devcore/` ディレクトリは `.gitignore` に追加することを推奨する（プロジェクトポリシーに依存）
- 大規模プロジェクトでは解析に時間がかかるため、進捗を逐次報告する
- 既に `.devcore/` が存在する場合は、上書きせず差分更新を行う
- 解析できなかった項目は `"confidence": "unknown"` として正直に記録する
