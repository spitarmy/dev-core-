# ZENNOBATE DEV CORE

個人専用AI開発支援システム

## 概要

ZENNOBATE DEV COREは、Google Antigravityをメイン開発環境として維持しながら、
携帯端末から開発指示、進捗確認、承認操作を行えるようにする個人専用システムです。

## 主な機能

- 📱 **携帯から開発指示**: 自然言語で開発要望を送信
- 🤖 **マルチAI協調**: GPT-5.6 Sol、Claude Fable 5、Gemini 3.1 Proを役割に応じて使い分け
- ✅ **承認ワークフロー**: 危険な操作は必ず人間の承認を要求
- 📊 **進捗確認**: リアルタイムでタスク状態と進捗を確認
- 🔄 **自動Git管理**: ブランチ作成、テスト、PR作成を自動化
- 🔒 **セキュリティ**: APIキー保護、コマンド制限、監査ログ

## アーキテクチャ

```
携帯 (PWA) → Cloud API (Cloud Run) → Firebase (Auth/Firestore/FCM)
                                              ↕
                                     開発PC (Local Worker)
                                              ↕
                                     Antigravity IDE + Git
```

## プロジェクト構成

```
zennobate-dev-core/
├── apps/
│   ├── web/          # Next.js PWA (携帯用)
│   ├── api/          # Cloud Run API
│   └── worker/       # Local Worker
├── packages/
│   ├── shared/       # 共通型定義
│   ├── providers/    # AI Provider Adapters
│   ├── task-engine/  # タスク状態管理
│   ├── security/     # セキュリティ
│   └── antigravity-bridge/  # Antigravity連携
├── .agents/          # Antigravityスキル
├── docs/             # ドキュメント
└── tests/            # E2Eテスト
```

## セットアップ

### 前提条件

- macOS (Apple Silicon推奨)
- Node.js 22以上
- Git
- Google Antigravity IDE

### インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd zennobate-dev-core

# 依存関係をインストール
npm install

# 環境変数を設定
cp .env.example .env
# .envを編集してAPIキーなどを設定

# TypeScriptのビルド
npm run build

# Local Workerを起動
npm run worker:start
```

### 環境変数の設定

`.env.example`をコピーして`.env`を作成し、以下を設定してください：

1. **Firebase設定**: Firebaseコンソールからプロジェクト情報を取得
2. **APIキー**: 各AIプロバイダーのコンソールから取得
   - OpenAI: https://platform.openai.com/api-keys
   - Anthropic: https://console.anthropic.com/settings/keys
   - Google AI: https://aistudio.google.com/apikey
3. **利用制限**: タスクごと・月間のコスト上限を設定

## Antigravityコマンド

| コマンド | 説明 |
|:--|:--|
| `/dev-init` | プロジェクト記憶を初期化 |
| `/dev-plan` | 要望を仕様に変換 |
| `/dev-build` | 承認された計画を実装 |
| `/dev-fix` | エラーを分析・修正 (最大3回) |
| `/dev-review` | 別モデルでレビュー |
| `/dev-release` | デプロイ準備 |
| `/dev-resume` | 中断タスクを再開 |
| `/dev-status` | 進捗を表示 |

## セキュリティ

- Googleログイン + メール許可リスト
- APIキーはSecret Managerまたはローカル環境変数で管理
- 本番デプロイ、DB変更、Git force pushは必ず人間の承認が必要
- すべての承認操作は監査ログに記録
- コマンド実行は許可リストで制限

## ライセンス

個人使用限定。外部販売不可。
