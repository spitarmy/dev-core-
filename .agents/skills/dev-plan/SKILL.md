---
name: dev-plan
description: >
  開発計画スキル。自然言語のリクエストを仕様書・受入条件・影響範囲・実装手順・
  テスト項目・リスクに変換する。/dev-plan スラッシュコマンドで起動。
---

# dev-plan — 開発計画策定

> **スラッシュコマンド:** `/dev-plan`
>
> ユーザーの自然言語リクエストを構造化された開発計画に変換します。

---

## 概要

`/dev-plan` は、ユーザーの要望を以下の要素に分解します:

1. **業務仕様書（Specification）**
2. **受入条件（Acceptance Criteria）**
3. **影響範囲（Impact Scope）**
4. **実装手順（Implementation Steps）**
5. **テスト項目（Test Items）**
6. **リスク評価（Risk Assessment）**

---

## 実行手順

### Step 1: リクエストの理解と明確化

1. ユーザーのリクエストを解析する
2. 曖昧な点を識別する
3. 曖昧な点が**合理的に補完可能**な場合:
   - `[AI推測]` タグを付けて補完する
   - 推測の根拠を明記する
4. 曖昧な点が**判断不能**な場合:
   - ユーザーに質問する（最大3つの質問に絞る）
   - 選択肢を提示して回答しやすくする

### Step 2: 仕様書の作成

```json
// .devcore/specs/{task-id}.json
{
  "task_id": "TASK-002",
  "title": "ユーザープロフィール編集機能",
  "created_at": "ISO8601",
  "created_by": "product-planner",
  "model_used": "gpt-5.6-sol",
  "status": "draft",

  "description": {
    "summary": "ユーザーが自分のプロフィール情報を編集できる機能を追加する",
    "background": "現在、プロフィールは登録時のみ設定可能。変更要望が多い。",
    "source": "human-decided"
  },

  "scope": {
    "in_scope": [
      "表示名の変更",
      "メールアドレスの変更（確認メール送信）",
      "プロフィール画像のアップロード"
    ],
    "out_of_scope": [
      "パスワード変更（別タスク）",
      "アカウント削除（別タスク）"
    ],
    "assumptions": [
      { "item": "画像はCloud Storageに保存", "source": "ai-inferred", "confidence": "medium" }
    ]
  },

  "acceptance_criteria": [
    {
      "id": "AC-001",
      "description": "ユーザーが表示名を変更し保存すると、即座に反映される",
      "type": "functional",
      "priority": "must"
    },
    {
      "id": "AC-002",
      "description": "メールアドレス変更時、確認メールが送信される",
      "type": "functional",
      "priority": "must"
    },
    {
      "id": "AC-003",
      "description": "プロフィール画像は5MB以下、JPEG/PNG/WebP形式のみ許可",
      "type": "constraint",
      "priority": "must",
      "source": "ai-inferred",
      "note": "[AI推測] 一般的なベストプラクティスに基づく"
    },
    {
      "id": "AC-004",
      "description": "スマートフォンでも正常に操作できる",
      "type": "non-functional",
      "priority": "should"
    }
  ]
}
```

### Step 3: 影響範囲の特定

`project-memory` スキルを使用して既存コードを参照し、影響範囲を特定:

```json
{
  "impact_scope": {
    "files_to_modify": [
      {
        "path": "src/components/Profile.tsx",
        "change_type": "modify",
        "risk": "low",
        "description": "表示専用から編集機能付きに変更"
      },
      {
        "path": "src/app/api/user/profile/route.ts",
        "change_type": "create",
        "risk": "medium",
        "description": "プロフィール更新APIの新規作成"
      }
    ],
    "files_to_create": [
      "src/components/ProfileEditForm.tsx",
      "src/app/api/user/profile/route.ts",
      "src/lib/storage.ts"
    ],
    "danger_zone_overlap": [
      {
        "zone": "src/middleware/auth.ts",
        "reason": "認証ミドルウェアに新しいルートの追加が必要",
        "requires_human_approval": false
      }
    ],
    "breaking_changes": [],
    "database_changes": [
      {
        "type": "migration",
        "description": "usersテーブルにavatar_urlカラム追加",
        "reversible": true
      }
    ]
  }
}
```

### Step 4: 実装手順の策定

```json
{
  "implementation_steps": [
    {
      "step": 1,
      "title": "DBマイグレーション作成",
      "description": "usersテーブルにavatar_urlカラムを追加するマイグレーション",
      "estimated_complexity": "low",
      "recommended_model": "antigravity"
    },
    {
      "step": 2,
      "title": "プロフィール更新API作成",
      "description": "PUT /api/user/profile エンドポイント",
      "estimated_complexity": "medium",
      "recommended_model": "claude-fable-5"
    },
    {
      "step": 3,
      "title": "画像アップロード処理",
      "description": "Cloud Storageへの画像アップロード・リサイズ処理",
      "estimated_complexity": "medium",
      "recommended_model": "claude-fable-5"
    },
    {
      "step": 4,
      "title": "フロントエンド実装",
      "description": "プロフィール編集フォームコンポーネント",
      "estimated_complexity": "medium",
      "recommended_model": "claude-fable-5"
    },
    {
      "step": 5,
      "title": "テスト作成",
      "description": "単体テスト・結合テスト・E2Eテスト",
      "estimated_complexity": "medium",
      "recommended_model": "antigravity"
    }
  ]
}
```

### Step 5: テスト項目の定義

```json
{
  "test_items": [
    {
      "id": "T-001",
      "type": "unit",
      "target": "プロフィール更新API",
      "cases": [
        "正常な更新リクエスト",
        "未認証ユーザーのリクエスト（401）",
        "無効なデータ（バリデーションエラー）",
        "存在しないユーザー（404）"
      ]
    },
    {
      "id": "T-002",
      "type": "integration",
      "target": "画像アップロード",
      "cases": [
        "有効な画像のアップロード",
        "サイズ超過の画像（5MB以上）",
        "無効な形式の画像",
        "アップロード後のURL取得"
      ]
    },
    {
      "id": "T-003",
      "type": "e2e",
      "target": "プロフィール編集フロー",
      "cases": [
        "表示名の変更と保存",
        "メールアドレスの変更と確認メール",
        "プロフィール画像のアップロードと表示"
      ]
    },
    {
      "id": "T-004",
      "type": "responsive",
      "target": "プロフィール編集画面",
      "cases": [
        "デスクトップ表示",
        "タブレット表示",
        "スマートフォン表示"
      ]
    }
  ]
}
```

### Step 6: リスク評価

```json
{
  "risks": [
    {
      "id": "R-001",
      "severity": "medium",
      "description": "画像アップロード時のセキュリティリスク（悪意のあるファイル）",
      "mitigation": "ファイルタイプ検証・サイズ制限・画像変換処理を実装"
    },
    {
      "id": "R-002",
      "severity": "low",
      "description": "DBマイグレーションの失敗",
      "mitigation": "ロールバック可能なマイグレーションを作成"
    }
  ]
}
```

---

## 過剰開発防止チェック

計画策定時に以下を確認:

1. **スコープクリープ検知**: リクエストに含まれない機能が計画に含まれていないか
2. **YAGNI原則**: 「将来必要になるかもしれない」機能を含めていないか
3. **複雑性チェック**: 単純な要求に対して過度に複雑な設計をしていないか

該当する場合はユーザーに警告を表示:

```
⚠️ 過剰開発の可能性を検知しました:
- 「画像リサイズ処理」はリクエストに含まれていません
- 最小限の実装として「画像のそのまま保存」を推奨します
- 追加しますか？ [はい / いいえ / 後で検討]
```

---

## 出力

計画策定完了後、以下をユーザーに提示:

1. **計画サマリー** — 概要・スコープ・主要ステップ
2. **確認事項** — `[AI推測]` 項目の確認依頼
3. **リスク** — 識別されたリスクと緩和策
4. **見積もり** — 推定実装時間・複雑度

ユーザーの承認後、`.devcore/specs/{task-id}.json` に保存。
