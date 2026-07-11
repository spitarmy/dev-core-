# 環境調査レポート

調査日時: 2026年7月12日 00:05 JST

## システム情報

| 項目 | 値 |
|:--|:--|
| OS | macOS 26.5.2 (Build 25F84) |
| アーキテクチャ | Apple Silicon (arm64) |
| メモリ | 8 GB |
| ディスク空き | 約 52 GB |
| ホスト名 | kachigayatarounoMacBook-Air.local |

## 開発ツール

| ツール | バージョン | 状態 |
|:--|:--|:--|
| Node.js | v24.12.0 | ✅ |
| npm | 11.6.2 | ✅ |
| npx | 11.6.2 | ✅ |
| Python | 3.14.0 | ✅ |
| pip | 25.3 | ✅ |
| Git | 2.50.1 (Apple Git-155) | ✅ |
| Docker | — | ❌ 未インストール |
| Docker Compose | — | ❌ 未インストール |
| Homebrew | — | ❌ 未インストール |
| pnpm | — | ❌ 未インストール |
| yarn | — | ❌ 未インストール |
| bun | — | ❌ 未インストール |

## Antigravity環境

| 項目 | 状態 | 詳細 |
|:--|:--|:--|
| Antigravity IDE | ✅ v1.107.0 | /Applications/Antigravity IDE.app |
| Antigravity CLI (agy) | ⚠️ | IDE内蔵、PATHに明示設定なし |
| Antigravity SDK (Python) | ❌ | 未インストール |
| ビルトインスキル | ✅ | antigravity-guide |
| グローバルスキル | ❌ | ディレクトリ未作成 |
| MCP設定 | ⚠️ | 設定ファイル空 |

## 外部サービスCLI

| ツール | 状態 | 詳細 |
|:--|:--|:--|
| GitHub CLI (gh) | ❌ | 未インストール |
| Google Cloud SDK | ✅ v559.0.0 | インストール済み |
| gcloud認証 | ❌ | 未ログイン |
| Firebase CLI | ❌ | 未インストール |

## APIキー状態

| プロバイダー | 環境変数 | 状態 |
|:--|:--|:--|
| OpenAI | OPENAI_API_KEY | ❌ 未設定 |
| Anthropic | ANTHROPIC_API_KEY | ❌ 未設定 |
| Google AI | GOOGLE_AI_API_KEY | ❌ 未設定 |

## Git設定

- `.gitconfig`: 未作成
- ユーザー名: 未設定
- メール: 未設定
- Git Worktree: 対応 (Git 2.50)

## 利用可能ポート

すべて利用可能: 3000, 3001, 4000, 5000, 5173, 8000, 8080, 8787, 8888, 9000

## 既存プロジェクト（変更禁止）

- ryubee-api (Desktop)
- ryubee-backend (Desktop)
- ryubee-console (Desktop)
- seo-title-optimizer (Home)
- ai-company-system (Home, Scratch)

## 確認済みAIモデル (2026年7月時点)

### OpenAI GPT-5.6 (2026年7月9日 GA)

| モデル | API ID | 入力料金/1M | 出力料金/1M |
|:--|:--|:--|:--|
| Sol | gpt-5.6-sol | $5.00 | $30.00 |
| Terra | gpt-5.6-terra | $2.50 | $15.00 |
| Luna | gpt-5.6-luna | $1.00 | $6.00 |

### Anthropic Claude

| モデル | API ID | 入力料金/1M | 出力料金/1M |
|:--|:--|:--|:--|
| Fable 5 | claude-fable-5 | $10.00 | $50.00 |
| Sonnet 5 | claude-sonnet-5 | 要確認 | 要確認 |
| Opus 4.8 | claude-opus-4-8 | 要確認 | 要確認 |
| Haiku 4.5 | claude-haiku-4-5 | 要確認 | 要確認 |

### Google Gemini

| モデル | API ID |
|:--|:--|
| Pro | gemini-3.1-pro |
| Flash | gemini-3.5-flash |
| Flash Lite | gemini-3.1-flash-lite |

## Phase 3で必要になるインストール

1. GitHub CLI: `npm install -g @github/cli` または Homebrew経由
2. Firebase CLI: `npm install -g firebase-tools`
3. gcloud認証: `gcloud auth login`
4. Firebase Authentication設定
5. Firestoreデータベース作成
