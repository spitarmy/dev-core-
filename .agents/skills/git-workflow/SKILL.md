---
name: git-workflow
description: >
  内部スキル。Gitブランチ管理、PR作成、コミットメッセージ規約を管理する。
  ブランチ名は devcore/{task-id}-{slug} 形式。main への直接 push は禁止。
---

# git-workflow — Git ワークフロー管理

> **種別:** 内部スキル（他のスキルから呼び出される）
>
> Gitのブランチ管理、コミット規約、PR作成を一元管理します。

---

## 概要

`git-workflow` は、ZENNOBATE DEV CORE のGit運用を統一し、
安全で追跡可能な開発フローを実現します。

---

## 絶対ルール

> [!CAUTION]
> **`main` / `master` ブランチへの直接 push は禁止。**
> すべての変更は feature ブランチ → PR → マージ の流れで行う。

---

## ブランチ命名規則

### 形式

```
devcore/{task-id}-{slug}
```

### 構成要素

| 要素 | 説明 | 例 |
|---|---|---|
| `devcore/` | ZENNOBATE DEV CORE のプレフィックス（固定） | `devcore/` |
| `{task-id}` | タスクID（大文字） | `TASK-002` |
| `{slug}` | タスク内容の英語スラッグ | `profile-edit` |

### slug 生成規則

1. タスクタイトルから英語のキーワードを抽出
2. 小文字に変換
3. スペースをハイフンに置換
4. 特殊文字を除去
5. 最大30文字に制限

### 例

| タスク | ブランチ名 |
|---|---|
| ユーザープロフィール編集 | `devcore/TASK-002-profile-edit` |
| ログインページのバグ修正 | `devcore/TASK-003-login-page-bugfix` |
| APIレート制限の実装 | `devcore/TASK-004-api-rate-limiting` |
| パフォーマンス改善 | `devcore/TASK-005-performance-improvement` |

---

## ブランチ操作

### ブランチ作成

```bash
# 最新の main から作成
git fetch origin
git checkout main
git pull origin main
git checkout -b devcore/{task-id}-{slug}
```

### ブランチ作成前のチェック

1. 作業中の変更がないことを確認（`git status`）
2. 同名のブランチが存在しないことを確認
3. main が最新であることを確認

---

## コミットメッセージ規約

### Conventional Commits 形式

```
{type}({scope}): {description}

{body}

{footer}
```

### タイプ

| タイプ | 用途 |
|---|---|
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `refactor` | リファクタリング（機能変更なし） |
| `test` | テストの追加・修正 |
| `docs` | ドキュメント変更 |
| `style` | コードスタイル変更（動作に影響なし） |
| `chore` | ビルド・設定変更 |
| `perf` | パフォーマンス改善 |

### スコープ

タスクIDを使用:

```
feat(TASK-002): ユーザープロフィール編集機能を追加
fix(TASK-003): ログインページのバリデーションエラーを修正
test(TASK-002): プロフィール更新APIの単体テストを追加
```

### ボディ

変更の詳細を記載（任意だが推奨）:

```
feat(TASK-002): ユーザープロフィール編集機能を追加

- プロフィール更新API (PUT /api/user/profile) を作成
- 画像アップロード処理を Cloud Storage で実装
- 編集フォームコンポーネントを作成
- 入力バリデーション (zod) を追加

Refs: TASK-002
```

### コミット粒度

- 論理的な単位でコミットする（ファイル単位ではなく機能単位）
- 1コミットで1つの論理的変更
- 中間状態でのコミットは避ける（テストが通る状態でコミット）

---

## Pull Request (PR) 作成

### PR テンプレート

```markdown
## 概要
<!-- 変更の概要を記載 -->

## タスク
- タスクID: TASK-002
- 仕様書: `.devcore/specs/TASK-002.json`

## 変更内容
<!-- 主要な変更をリスト -->
- [ ] プロフィール更新API
- [ ] 画像アップロード処理
- [ ] 編集フォームコンポーネント
- [ ] テストコード

## テスト結果
<!-- テスト結果のサマリー -->
- Lint: ✅ パス
- 型チェック: ✅ パス
- 単体テスト: ✅ 43/43 パス
- 結合テスト: ✅ 12/12 パス
- E2Eテスト: ⚠️ 7/8 パス（Firefox でのファイルアップロードが不安定）

## レビュー結果
<!-- dev-review の結果 -->
- レビューモデル: GPT-5.6 Sol
- 判定: 承認
- findings: 0件（すべて修正済み）

## スクリーンショット
<!-- UI変更がある場合 -->

## デプロイ時の注意事項
<!-- マイグレーション、環境変数の追加等 -->
- DBマイグレーションの実行が必要
- 環境変数 `CLOUD_STORAGE_BUCKET` の追加が必要

## ロールバック手順
<!-- 問題発生時のロールバック手順 -->
1. マイグレーションのロールバック: `npx prisma migrate rollback`
2. デプロイのロールバック: 前バージョンへの再デプロイ
```

### PR 作成コマンド

```bash
# リモートにプッシュ
git push origin devcore/{task-id}-{slug}

# PR 作成（GitHub CLI）
gh pr create \
  --title "feat(TASK-002): ユーザープロフィール編集機能" \
  --body-file .devcore/pr-body-TASK-002.md \
  --base main \
  --head devcore/TASK-002-profile-edit \
  --label "devcore,feature"
```

---

## 安全チェック

### プッシュ前チェック

1. **ブランチ名の確認**: `devcore/` プレフィックスがあること
2. **対象ブランチの確認**: main/master でないこと
3. **テストの確認**: すべてのテストがパスしていること
4. **機密情報の確認**: API Key等がコミットに含まれていないこと

```bash
# 機密情報のスキャン（プッシュ前）
git diff --cached | grep -iE '(api[_-]?key|secret|password|token)\s*[=:]\s*["\047]' && echo "⚠️ 機密情報が含まれている可能性があります"
```

### 緊急時の対応

誤って main にプッシュした場合:

```bash
# 即座にリバート
git revert HEAD
git push origin main

# ユーザーに報告
echo "⚠️ main ブランチへの誤プッシュが発生しました。リバート済みです。"
```

---

## 注意事項

- Force push (`git push -f`) は feature ブランチのみ許可
- マージは Squash merge を推奨（プロジェクト設定に従う）
- コンフリクト発生時は手動解決を依頼（自動解決は行わない）
- `.devcore/` ディレクトリの変更はコミットに含めない（`.gitignore` 推奨）
