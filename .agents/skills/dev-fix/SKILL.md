---
name: dev-fix
description: >
  修正スキル。エラー・テスト失敗・表示崩れを分析し、修正＋再テストを最大3回行う。
  すべて失敗した場合は人間にエスカレーションする。/dev-fix スラッシュコマンドで起動。
---

# dev-fix — エラー修正

> **スラッシュコマンド:** `/dev-fix`
>
> エラー・テスト失敗・表示崩れを分析し、自動修正を試みます。

---

## 概要

`/dev-fix` は、以下の問題を対象に修正を行います:

- **ランタイムエラー** — アプリケーション実行時のエラー
- **テスト失敗** — 単体/結合/E2Eテストの失敗
- **ビルドエラー** — コンパイル・バンドルエラー
- **Lint / 型エラー** — 静的解析の警告・エラー
- **表示崩れ** — UI/レイアウトの問題
- **パフォーマンス問題** — 遅延・メモリリーク等

---

## 実行手順

### Step 1: 問題の入力

ユーザーから以下のいずれかの形式で問題を受け取る:

1. **エラーメッセージのコピー&ペースト**
2. **テスト結果の出力**
3. **スクリーンショット（表示崩れ）**
4. **問題の自然言語説明**
5. **自動検出**（`/dev-build` からの引き継ぎ）

### Step 2: 問題の分析

#### エラー分類

```json
{
  "error_analysis": {
    "type": "runtime_error | test_failure | build_error | lint_error | display_issue | performance",
    "severity": "critical | high | medium | low",
    "source": {
      "file": "src/components/ProfileEditForm.tsx",
      "line": 42,
      "function": "handleSubmit"
    },
    "error_message": "TypeError: Cannot read properties of undefined (reading 'email')",
    "root_cause_hypothesis": [
      {
        "hypothesis": "ユーザーオブジェクトがnullの場合のハンドリングが欠如",
        "confidence": "high",
        "evidence": "nullチェックなしでuser.emailにアクセスしている"
      }
    ],
    "related_files": [
      "src/components/ProfileEditForm.tsx",
      "src/hooks/useUser.ts"
    ]
  }
}
```

#### 分析手法

1. **エラーメッセージの解析** — スタックトレース、エラーコードの解読
2. **コード解析** — 該当ファイルと周辺コードの確認
3. **変更履歴の確認** — 最近の変更がエラーの原因か
4. **依存関係の確認** — パッケージバージョンの不整合等
5. **環境差異の確認** — 開発/本番環境の差異

### Step 3: 修正の実行（最大3回ループ）

#### 修正ループ

```
分析完了
  ↓
修正試行 1: 最も可能性の高い仮説に基づく修正
  ↓ テスト実行
  ↓
成功? → はい → Step 4 へ
  ↓ いいえ
修正試行 2: 次の仮説、またはアプローチ変更
  ↓ テスト実行
  ↓
成功? → はい → Step 4 へ
  ↓ いいえ
修正試行 3: 別の根本原因を検討した修正
  ↓ テスト実行
  ↓
成功? → はい → Step 4 へ
  ↓ いいえ
エスカレーション → Step 5 へ
```

#### 修正原則

1. **最小限の変更** — 問題を修正するための最小限のコード変更
2. **副作用の防止** — 修正が他の部分に悪影響を与えないことを確認
3. **根本原因の対処** — 表面的な修正ではなく根本原因に対処する
4. **記録の保持** — 各修正試行の内容と結果を記録

#### 各試行の記録

```json
{
  "fix_attempts": [
    {
      "attempt": 1,
      "timestamp": "ISO8601",
      "hypothesis": "nullチェックの欠如",
      "changes": [
        {
          "file": "src/components/ProfileEditForm.tsx",
          "line": 42,
          "before": "const email = user.email;",
          "after": "const email = user?.email ?? '';"
        }
      ],
      "test_result": "passed",
      "success": true
    }
  ]
}
```

### Step 4: 修正成功時の処理

1. **修正内容のコミット**:
   ```
   fix(TASK-002): ProfileEditFormのnullチェック追加
   
   user オブジェクトが null の場合に TypeError が発生する問題を修正。
   Optional chaining と nullish coalescing を使用。
   ```

2. **プロジェクトメモリの更新**:
   - 修正内容をチェックポイントに記録
   - 類似のバグパターンを `lessons_learned` に追加

3. **ユーザーへの報告**:
   - 修正内容のサマリー
   - 根本原因の説明
   - 回帰テストの結果

### Step 5: エスカレーション（3回失敗時）

3回の修正試行がすべて失敗した場合:

```
🚨 自動修正に失敗しました（3回試行済み）

問題: TypeError: Cannot read properties of undefined (reading 'email')
ファイル: src/components/ProfileEditForm.tsx:42

試行履歴:
1. nullチェック追加 → 別のエラーが発生
2. useUserフックの修正 → テスト失敗
3. コンポーネント初期化の変更 → ビルドエラー

推測される根本原因:
- useUser フックの非同期処理とコンポーネントのライフサイクルの不整合
- React の Suspense バウンダリが必要な可能性

推奨する手動対応:
1. useUser フックの返り値を確認
2. ローディング状態のハンドリングを追加
3. Suspense バウンダリの導入を検討

関連ファイル:
- src/components/ProfileEditForm.tsx
- src/hooks/useUser.ts
- src/providers/AuthProvider.tsx
```

---

## 表示崩れの修正

表示崩れの場合は追加の手順:

1. **スクリーンショット分析**（提供された場合）
2. **CSS/スタイルの確認** — レスポンシブブレークポイント、flexbox/grid
3. **ブラウザ互換性** — prefixの確認、polyfillの必要性
4. **修正後のスクリーンショット** — 修正結果の視覚的確認

---

## 注意事項

- 修正は元の実装と同じブランチで行う
- 修正が仕様変更を伴う場合は、先に `/dev-plan` で仕様を更新する
- セキュリティに関わるバグは、修正と同時に影響範囲を調査する
- パフォーマンス問題は、計測データに基づいて修正する（推測での最適化は避ける）
