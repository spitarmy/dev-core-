---
name: testing
description: >
  内部スキル。Lint、型チェック、単体テスト、結合テスト、E2Eテストを実行する。
  テスト結果を正直に報告し、未実行項目は「未実行」と明記する。成功を偽装しない。
---

# testing — テスト実行

> **種別:** 内部スキル（他のスキルから呼び出される）
>
> 包括的なテスト実行と正直な結果報告を行います。

---

## 概要

`testing` スキルは、コード品質を保証するためのテスト実行パイプラインです。

---

## 絶対ルール

> [!CAUTION]
> **テスト成功を偽装してはならない。**
> 実行できなかったテストは `未実行` と報告する。
> エラーを隠蔽したり、テスト結果を改ざんしてはならない。

---

## テストパイプライン

### Phase 1: 静的解析

#### 1.1 Lint チェック

プロジェクトのlintツールを使用:

```bash
# JavaScript / TypeScript
npx eslint src/ --format json

# Python
python -m flake8 src/ --format json
python -m ruff check src/ --output-format json

# Go
golangci-lint run --out-format json
```

結果の記録:
```json
{
  "lint": {
    "status": "passed | failed | not_configured",
    "tool": "eslint",
    "errors": 0,
    "warnings": 3,
    "details": [
      {
        "file": "src/utils.ts",
        "line": 15,
        "severity": "warning",
        "rule": "no-unused-vars",
        "message": "'tempVar' is defined but never used"
      }
    ]
  }
}
```

#### 1.2 型チェック

```bash
# TypeScript
npx tsc --noEmit --pretty false 2>&1 | head -100

# Python (mypy)
python -m mypy src/ --no-color-output

# Python (pyright)
npx pyright src/
```

結果の記録:
```json
{
  "type_check": {
    "status": "passed | failed | not_configured",
    "tool": "tsc",
    "errors": 0,
    "details": []
  }
}
```

### Phase 2: 単体テスト

```bash
# Jest
npx jest --json --outputFile=test-results.json

# Vitest
npx vitest run --reporter=json --outputFile=test-results.json

# Pytest
python -m pytest --json-report --json-report-file=test-results.json

# Go
go test ./... -json
```

結果の記録:
```json
{
  "unit_tests": {
    "status": "passed | failed | not_configured | 未実行",
    "tool": "jest",
    "total": 45,
    "passed": 43,
    "failed": 2,
    "skipped": 0,
    "duration_ms": 3200,
    "failures": [
      {
        "test_name": "ProfileEditForm > should validate email format",
        "file": "src/components/__tests__/ProfileEditForm.test.tsx",
        "error": "Expected: true, Received: false",
        "stack_trace": "..."
      }
    ],
    "coverage": {
      "lines": 78.5,
      "branches": 65.2,
      "functions": 82.1,
      "statements": 79.0
    }
  }
}
```

### Phase 3: 結合テスト

```bash
# API結合テスト
npx jest --testPathPattern='integration' --json

# データベース結合テスト
npx jest --testPathPattern='db' --json
```

結果の記録:
```json
{
  "integration_tests": {
    "status": "passed | failed | not_configured | 未実行",
    "reason_if_not_run": "結合テストの設定が見つかりません",
    "total": 12,
    "passed": 12,
    "failed": 0,
    "duration_ms": 8500
  }
}
```

### Phase 4: E2Eテスト

```bash
# Playwright
npx playwright test --reporter=json

# Cypress
npx cypress run --reporter json

# Puppeteer
# カスタムスクリプトによる実行
```

結果の記録:
```json
{
  "e2e_tests": {
    "status": "passed | failed | not_configured | 未実行",
    "reason_if_not_run": "E2Eテストフレームワークが未設定",
    "tool": "playwright",
    "total": 8,
    "passed": 7,
    "failed": 1,
    "duration_ms": 25000,
    "browsers_tested": ["chromium", "firefox"],
    "browsers_not_tested": ["webkit"],
    "failures": [
      {
        "test_name": "Profile edit flow > should upload avatar",
        "browser": "firefox",
        "error": "Timeout waiting for file upload dialog",
        "screenshot": "screenshots/profile-upload-failure.png"
      }
    ]
  }
}
```

### Phase 5: 回帰テスト

既存のテストスイート全体を実行し、新しい変更が既存機能を壊していないか確認:

```bash
# 全テスト実行
npx jest --json
npx vitest run --reporter=json
```

---

## テスト結果レポート

### 完全な結果レポート

```json
{
  "test_report": {
    "task_id": "TASK-002",
    "executed_at": "ISO8601",
    "overall_status": "passed | failed | partial",

    "phases": {
      "lint": { "status": "passed", "errors": 0, "warnings": 3 },
      "type_check": { "status": "passed", "errors": 0 },
      "unit_tests": { "status": "passed", "passed": 43, "failed": 0 },
      "integration_tests": { "status": "未実行", "reason": "テスト環境が未設定" },
      "e2e_tests": { "status": "failed", "passed": 7, "failed": 1 },
      "regression": { "status": "passed", "passed": 120, "failed": 0 }
    },

    "summary": {
      "total_tests": 170,
      "total_passed": 163,
      "total_failed": 1,
      "total_skipped": 0,
      "total_not_run": 12,
      "pass_rate": "95.9%",
      "duration_ms": 38000
    },

    "honest_disclosure": [
      "結合テストは環境未設定のため未実行です",
      "E2Eテストのwebkitブラウザは未テストです",
      "カバレッジは新規コードのみで78.5%です"
    ]
  }
}
```

### 正直な報告の原則

1. **未実行は未実行**: テスト環境がない場合、`未実行` と報告する
2. **部分実行は部分実行**: 一部のブラウザでのみテストした場合、明記する
3. **カバレッジの正直な報告**: 実際のカバレッジ数値を報告する
4. **Flaky テスト**: 不安定なテストはその旨を記載する
5. **スキップされたテスト**: スキップ理由を明記する

---

## テスト環境の自動検出

プロジェクトのテスト設定を自動検出:

1. `package.json` の `scripts` セクション
2. `jest.config.*`, `vitest.config.*`, `playwright.config.*`
3. `pytest.ini`, `setup.cfg`, `pyproject.toml`
4. `.github/workflows/` 内のテストジョブ

検出できない場合は、ユーザーにテストコマンドを確認する。

---

## 注意事項

- テスト実行は開発環境で行う（本番環境では実行しない）
- 長時間かかるテストは進捗を逐次報告する
- テストデータはクリーンアップする
- 外部サービスに依存するテストはモック化を推奨
- テスト結果はすべて `.devcore/` に保存する
