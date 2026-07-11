---
name: dev-resume
description: >
  タスク復帰スキル。.devcore/current-task.json を読み込み、作業コンテキストを復元し、
  最後のチェックポイントからタスクを再開する。/dev-resume スラッシュコマンドで起動。
---

# dev-resume — タスク復帰

> **スラッシュコマンド:** `/dev-resume`
>
> 中断されたタスクのコンテキストを復元し、最後のチェックポイントから再開します。

---

## 概要

`/dev-resume` は、以下のシナリオでタスクを復帰させるコマンドです:

- **セッション切断** — ブラウザやIDEのクラッシュ後
- **意図的な中断** — `/pause` で中断したタスクの再開
- **翌日の作業再開** — 前日に未完了のタスクの続行
- **モデル切替** — 別のAIモデルでの作業引き継ぎ

---

## 実行手順

### Step 1: 現在のタスク状態を読み込み

```json
// .devcore/current-task.json を読み込む
{
  "task_id": "TASK-002",
  "title": "ユーザープロフィール編集機能",
  "status": "in_progress",
  "started_at": "2025-01-15T10:00:00Z",
  "assigned_model": "claude-fable-5",
  "branch": "devcore/TASK-002-profile-edit",
  "spec_file": "specs/TASK-002.json",
  "checkpoints": [
    {
      "checkpoint_id": "CP-001",
      "timestamp": "2025-01-15T10:30:00Z",
      "phase": "implementation",
      "step": 1,
      "description": "DBマイグレーション作成完了",
      "files_modified": ["prisma/migrations/20250115_add_avatar_url/migration.sql"],
      "tests_status": "passing"
    },
    {
      "checkpoint_id": "CP-002",
      "timestamp": "2025-01-15T11:00:00Z",
      "phase": "implementation",
      "step": 2,
      "description": "プロフィール更新API作成完了",
      "files_modified": ["src/app/api/user/profile/route.ts"],
      "tests_status": "passing"
    }
  ],
  "last_error": null,
  "paused_at": "2025-01-15T12:00:00Z",
  "pause_reason": "user_requested"
}
```

### Step 2: コンテキストの復元

#### 2.1 プロジェクト情報のロード

`project-memory` スキルを使用して以下をロード:

1. `project-summary.json` — プロジェクト概要
2. `tech-stack.json` — 技術スタック
3. `coding-rules.json` — コーディング規約
4. `specs/{task-id}.json` — タスク仕様書

#### 2.2 Git 状態の確認

```bash
# 現在のブランチを確認
git branch --show-current

# 正しいブランチに切り替え
git checkout devcore/TASK-002-profile-edit

# 作業中の変更を確認
git status

# 最後のコミットを確認
git log -1 --oneline
```

#### 2.3 変更済みファイルの確認

チェックポイントから変更済みファイルを特定:

```bash
# main からの差分
git diff main...HEAD --name-only

# 未コミットの変更
git diff --name-only
git diff --cached --name-only
```

### Step 3: 再開ポイントの特定

最後のチェックポイントから、次に実行すべきステップを特定:

```json
{
  "resume_point": {
    "last_checkpoint": "CP-002",
    "last_completed_step": 2,
    "next_step": 3,
    "next_step_title": "画像アップロード処理",
    "remaining_steps": [3, 4, 5],
    "estimated_remaining_work": "Steps 3-5: 画像アップロード、フロントエンド、テスト"
  }
}
```

### Step 4: 状態の整合性チェック

再開前に以下を確認:

1. **ファイルの整合性**: チェックポイントに記録されたファイルが存在するか
2. **テストの実行**: 既存の実装が正常に動作するか確認
3. **依存関係の更新**: `package-lock.json` 等が最新か
4. **ブランチの状態**: main との差分が想定通りか

```bash
# 依存関係の確認
npm ci

# 既存テストの実行
npx jest --testPathPattern='profile' --json
```

整合性に問題がある場合:

```
⚠️ 整合性チェックで問題が検出されました:

1. テスト失敗: ProfileAPI.test.ts — 2件のテストが失敗
   原因: main ブランチの変更と競合している可能性
   
2. 依存関係: package-lock.json が古い
   対応: npm ci を実行済み

対応:
- テスト失敗については /dev-fix で修正しますか？
- main の最新変更をマージしますか？
```

### Step 5: ユーザーへの状態報告

```
═══════════════════════════════════════════════
🔄 タスク復帰 — TASK-002
═══════════════════════════════════════════════

タスク: ユーザープロフィール編集機能
ブランチ: devcore/TASK-002-profile-edit
中断日時: 2025-01-15 12:00 (3時間前)
中断理由: ユーザーリクエスト

完了済みステップ:
  ✅ Step 1: DBマイグレーション作成
  ✅ Step 2: プロフィール更新API作成
  
残りステップ:
  ⏳ Step 3: 画像アップロード処理
  ⏳ Step 4: フロントエンド実装
  ⏳ Step 5: テスト作成

整合性チェック:
  ✅ ファイル整合性: OK
  ✅ 既存テスト: パス
  ✅ 依存関係: 最新
  ✅ ブランチ状態: 正常

次のアクション: Step 3「画像アップロード処理」から再開します。
続行しますか？ [はい / 最初からやり直す / キャンセル]
═══════════════════════════════════════════════
```

### Step 6: タスクの再開

ユーザーの確認後、次のステップから実行を再開:

1. `current-task.json` のステータスを `in_progress` に更新
2. `paused_at` をクリア
3. 通常の `/dev-build` フローに合流

---

## タスクが存在しない場合

`current-task.json` が空または存在しない場合:

```
ℹ️ 進行中のタスクが見つかりません。

最近のタスク履歴:
1. TASK-001: ユーザー登録フォーム — 完了 (2025-01-14)
2. TASK-002: プロフィール編集 — キャンセル (2025-01-13)

新しいタスクを開始するには /dev-plan を使用してください。
```

---

## 複数タスクの管理

将来的に複数タスクの並行作業が必要な場合:

```json
// .devcore/tasks/ ディレクトリに個別タスクファイルを配置
{
  "active_tasks": [
    { "task_id": "TASK-002", "branch": "devcore/TASK-002-profile-edit", "status": "paused" },
    { "task_id": "TASK-003", "branch": "devcore/TASK-003-login-fix", "status": "in_progress" }
  ]
}
```

`/dev-resume` 実行時に再開対象のタスクを選択:

```
複数のタスクが一時停止中です:

1. TASK-002: プロフィール編集 (Step 2/5 完了)
2. TASK-003: ログインバグ修正 (Step 1/3 完了)

どのタスクを再開しますか？ [1 / 2]
```

---

## 注意事項

- コンテキスト復元時にトークン消費を最小限に抑える（必要な情報のみロード）
- 長時間中断後は main の変更を確認し、必要に応じてマージする
- チェックポイントが破損している場合は、Gitの履歴から状態を復元する
- 再開時は前回のモデルを優先するが、利用不可の場合は `model-routing` で代替を選定
