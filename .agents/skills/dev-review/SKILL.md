---
name: dev-review
description: >
  レビュースキル。実装に使用したモデルとは異なるモデルでコードレビューを行う。
  仕様準拠・バグ・セキュリティ・保守性・UIを確認する。/dev-review スラッシュコマンドで起動。
---

# dev-review — 独立コードレビュー

> **スラッシュコマンド:** `/dev-review`
>
> 実装とは**異なるAIモデル**を使用して、独立したコードレビューを実施します。

---

## 概要

`/dev-review` は、実装品質を担保するための独立レビューです。
**実装に使用したモデルとは異なるモデルを使用することが必須**です。

---

## 必須ルール

> [!CAUTION]
> **実装モデルとレビューモデルは必ず異なるモデルを使用すること。**
> 同一モデルでの実装→レビューはバイアスが生じるため禁止。

| 実装モデル | レビューモデル候補 |
|---|---|
| Claude Fable 5 | GPT-5.6 Sol |
| GPT-5.6 Sol | Claude Fable 5 |
| Antigravity | GPT-5.6 Sol / Claude Fable 5 |

---

## 実行手順

### Step 1: レビューコンテキストの準備

1. `project-memory` からタスク情報をロード
2. 仕様書（`specs/{task-id}.json`）を読み込み
3. 実装に使用されたモデルを確認
4. `model-routing` で異なるレビューモデルを選定
5. Git差分を取得:
   ```bash
   git diff main...devcore/{task-id}-{slug}
   ```

### Step 2: レビュー観点

以下の5つの観点でレビューを実施:

#### 2.1 仕様準拠チェック

- [ ] すべての受入条件（Acceptance Criteria）が満たされているか
- [ ] スコープ外の機能が含まれていないか
- [ ] 仕様で定義された制約が守られているか
- [ ] エッジケースが考慮されているか

```json
{
  "spec_compliance": {
    "acceptance_criteria": [
      {
        "id": "AC-001",
        "status": "satisfied",
        "evidence": "ProfileEditForm.tsxのhandleSubmit関数で実装"
      },
      {
        "id": "AC-003",
        "status": "partially_satisfied",
        "issue": "画像サイズ制限は実装されているが、WebP形式のチェックが欠如",
        "severity": "medium"
      }
    ]
  }
}
```

#### 2.2 バグ検出

- [ ] Null参照 / undefined アクセス
- [ ] 境界値の処理
- [ ] 非同期処理のエラーハンドリング
- [ ] メモリリーク（イベントリスナー、タイマー等）
- [ ] 競合状態（Race Condition）
- [ ] デッドロック / 無限ループ

#### 2.3 セキュリティ確認

`security-review` スキルを呼び出して詳細なセキュリティチェックを実行:

- [ ] API Key / Secret の露出
- [ ] SQLインジェクション / NoSQLインジェクション
- [ ] XSS（クロスサイトスクリプティング）
- [ ] CSRF（クロスサイトリクエストフォージェリ）
- [ ] 認証バイパス
- [ ] ファイルアップロードの検証
- [ ] 適切なアクセス制御

#### 2.4 保守性確認

- [ ] コードの可読性（変数名、関数名の明確さ）
- [ ] 適切なコメント
- [ ] DRY原則（重複コードの排除）
- [ ] 単一責任の原則
- [ ] 既存のコーディング規約への準拠
- [ ] テストの網羅性

#### 2.5 UI / UX 確認

フロントエンド変更がある場合:

- [ ] レスポンシブデザイン
- [ ] アクセシビリティ（ARIA属性、キーボード操作）
- [ ] ローディング状態の表示
- [ ] エラー状態の表示
- [ ] 空状態の表示

### Step 3: レビュー結果の作成

```json
{
  "review_result": {
    "task_id": "TASK-002",
    "reviewer_model": "gpt-5.6-sol",
    "implementation_model": "claude-fable-5",
    "reviewed_at": "ISO8601",
    "verdict": "approved | request_changes | rejected",

    "summary": "概ね良好な実装。2件の修正要望あり。",

    "findings": [
      {
        "id": "F-001",
        "severity": "high",
        "category": "security",
        "file": "src/app/api/user/profile/route.ts",
        "line": 25,
        "title": "ファイルタイプ検証の不足",
        "description": "アップロードされた画像のContent-Typeのみチェックしているが、マジックバイトの検証が必要",
        "suggestion": "file-type パッケージを使用してマジックバイトを検証する",
        "blocking": true
      },
      {
        "id": "F-002",
        "severity": "medium",
        "category": "spec_compliance",
        "file": "src/components/ProfileEditForm.tsx",
        "line": 78,
        "title": "WebP形式の許可が未実装",
        "description": "AC-003でWebP形式を許可とあるが、実装ではJPEG/PNGのみ許可",
        "suggestion": "accept属性にimage/webpを追加",
        "blocking": true
      },
      {
        "id": "F-003",
        "severity": "low",
        "category": "maintainability",
        "file": "src/components/ProfileEditForm.tsx",
        "line": 15,
        "title": "マジックナンバーの使用",
        "description": "ファイルサイズ上限が直接5242880と記載されている",
        "suggestion": "定数として切り出す: const MAX_FILE_SIZE = 5 * 1024 * 1024;",
        "blocking": false
      }
    ],

    "stats": {
      "files_reviewed": 5,
      "total_findings": 3,
      "blocking_findings": 2,
      "critical": 0,
      "high": 1,
      "medium": 1,
      "low": 1
    }
  }
}
```

### Step 4: 判定

#### Approved（承認）
- blocking な findings がゼロ
- セキュリティ上の重大な問題がゼロ
- 仕様準拠率100%

#### Request Changes（修正要求）
- blocking な findings が存在する
- 但し修正可能な範囲内

#### Rejected（差し戻し）
- 根本的な設計の問題がある
- セキュリティ上の重大な脆弱性がある
- 仕様との大幅な乖離がある

### Step 5: レビュー後の処理

#### 承認の場合
1. レビュー結果を `.devcore/` に保存
2. `current-task.json` のステータスを `review_approved` に更新
3. ユーザーに `/dev-release` を提案

#### 修正要求の場合
1. レビュー結果をユーザーに表示
2. blocking findings の修正を `/dev-fix` で実行
3. 修正後に再レビューを実施

#### 差し戻しの場合
1. 差し戻し理由をユーザーに詳細に説明
2. `/dev-plan` での仕様見直しを提案
3. 必要に応じて設計からやり直し

---

## 注意事項

- レビューは客観的かつ建設的に行う
- 個人的な好みによる指摘は避ける（プロジェクトの規約に従う）
- 良い実装にはポジティブなフィードバックも記載する
- レビュー結果は将来の参考のためにすべて記録する
