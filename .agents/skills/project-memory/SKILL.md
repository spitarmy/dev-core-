---
name: project-memory
description: >
  内部スキル。プロジェクトメモリ（.devcore/）の読み書きを管理する。
  他のスキルにコンテキストを提供し、実装後にメモリを更新する。
  AI推測情報と人間決定情報を区別して管理する。
---

# project-memory — プロジェクトメモリ管理

> **種別:** 内部スキル（他のスキルから呼び出される）
>
> `.devcore/` ディレクトリ内のプロジェクトメモリファイルを読み書きし、
> 開発コンテキストを永続化・復元します。

---

## 概要

`project-memory` は、ZENNOBATE DEV CORE の「記憶」を担うスキルです。
すべてのスキルはこのスキルを通じてプロジェクトの状態を読み取り、更新します。

---

## メモリファイル構造

```
.devcore/
├── project-summary.json    # プロジェクト概要
├── tech-stack.json         # 技術スタック
├── features.json           # 機能一覧
├── danger-zones.json       # 危険ゾーン
├── coding-rules.json       # コーディング規約
├── current-task.json       # 現在のタスク
├── task-history.json       # タスク履歴
├── model-usage.json        # モデル使用履歴
├── cost-tracking.json      # コスト追跡
└── specs/                  # 仕様書ディレクトリ
    └── {task-id}.json      # 各タスクの仕様書
```

---

## 操作定義

### READ: コンテキストのロード

タスク開始時に以下のファイルを読み込み、エージェントにコンテキストを提供する:

1. **必須ロード:**
   - `project-summary.json` — プロジェクトの目的と概要
   - `tech-stack.json` — 使用技術の情報
   - `coding-rules.json` — 遵守すべきコーディング規約
   - `current-task.json` — 進行中タスクの状態

2. **条件付きロード:**
   - `danger-zones.json` — 変更対象ファイルが危険ゾーンに該当する場合
   - `features.json` — 新機能追加・既存機能変更の場合
   - `specs/{task-id}.json` — 該当タスクの仕様書
   - `task-history.json` — 類似タスクの過去実績を参照する場合

### WRITE: メモリの更新

以下のタイミングでメモリを更新する:

#### タスク開始時
```json
// current-task.json を更新
{
  "task_id": "TASK-001",
  "title": "ユーザー登録フォームの追加",
  "status": "in_progress",
  "started_at": "ISO8601",
  "assigned_model": "claude-fable-5",
  "branch": "devcore/TASK-001-user-registration",
  "spec_file": "specs/TASK-001.json",
  "checkpoints": []
}
```

#### チェックポイント記録
```json
// current-task.json の checkpoints 配列に追加
{
  "checkpoint_id": "CP-001",
  "timestamp": "ISO8601",
  "phase": "implementation",
  "description": "基本フォームコンポーネント作成完了",
  "files_modified": ["src/components/RegisterForm.tsx"],
  "tests_status": "passing",
  "notes": "バリデーションロジックは次のチェックポイントで実装"
}
```

#### タスク完了時
```json
// task-history.json に移動
{
  "task_id": "TASK-001",
  "title": "ユーザー登録フォームの追加",
  "status": "completed",
  "started_at": "ISO8601",
  "completed_at": "ISO8601",
  "models_used": ["claude-fable-5", "gpt-5.6-sol"],
  "files_modified": ["src/components/RegisterForm.tsx", "src/app/api/register/route.ts"],
  "total_tokens": 45000,
  "estimated_cost": "$0.12",
  "review_result": "approved",
  "lessons_learned": "フォームバリデーションにはzodを使用するのがプロジェクト標準"
}
```

#### 機能リスト更新
実装完了後、`features.json` に新機能を追加:
```json
{
  "name": "ユーザー登録",
  "type": "feature",
  "files": ["src/components/RegisterForm.tsx", "src/app/api/register/route.ts"],
  "status": "active",
  "source": "human-decided",
  "added_by_task": "TASK-001",
  "added_at": "ISO8601"
}
```

---

## AI推測 vs 人間決定の管理

### タグ付けルール

すべてのメモリエントリに `source` フィールドを付与:

| source 値 | 意味 | 例 |
|---|---|---|
| `ai-inferred` | AIが自動解析・推測した情報 | コード解析から推測した技術スタック |
| `human-decided` | 人間が明示的に決定・確認した情報 | ユーザーが「PostgreSQL使用」と明言 |
| `mixed` | AI推測後に人間が部分的に確認 | AI推測のスタックをユーザーが一部修正 |

### 昇格ルール

- ユーザーが `[AI推測]` 項目を確認 → `source` を `human-decided` に更新
- ユーザーが `[AI推測]` 項目を修正 → 内容を更新し `source` を `human-decided` に
- 新規 `[AI推測]` 項目は必ずユーザーに確認を促す表示を出す

### 信頼度レベル

```json
{
  "confidence": "high",    // ファイルから明確に判定可能
  "confidence": "medium",  // 複数の手がかりから推測
  "confidence": "low",     // 限定的な情報からの推測
  "confidence": "unknown"  // 判定不能
}
```

---

## コンテキストロード戦略

### 軽量ロード（デフォルト）
簡単なタスクの場合、最小限のコンテキストをロード:
- `project-summary.json` のサマリーのみ
- `coding-rules.json` の主要ルールのみ
- `current-task.json`

### フルロード
複雑なタスク・大規模変更の場合:
- すべてのメモリファイルをロード
- 関連する過去タスクの履歴もロード
- 危険ゾーン情報を含める

### 選択的ロード
特定のファイルのみが必要な場合:
- 呼び出し元スキルが必要なファイルを指定
- 不要なコンテキストによるトークン消費を防止

---

## エラーハンドリング

- `.devcore/` が存在しない場合 → ユーザーに `/dev-init` の実行を促す
- メモリファイルが破損している場合 → バックアップから復元を試みる（なければ再生成を提案）
- 書き込み権限がない場合 → エラーを報告し、手動での対応を依頼する

---

## 注意事項

- メモリの更新は**アトミック**に行う（部分更新でファイルが壊れないようにする）
- 大量のタスク履歴は定期的にアーカイブする（直近20件を保持）
- センシティブ情報（API Key等）はメモリに保存しない
- メモリファイルの直接編集は推奨しない — 必ずこのスキル経由で操作する
