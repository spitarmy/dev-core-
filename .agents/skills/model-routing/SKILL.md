---
name: model-routing
description: >
  内部スキル。タスクの種別・複雑度に応じて適切なAIモデルを選定する。
  フォールバックロジック、トークン使用量追跡、コスト制限を実装する。
---

# model-routing — AIモデルルーティング

> **種別:** 内部スキル（他のスキルから呼び出される）
>
> タスクに最適なAIモデルを自動選定し、フォールバック・コスト管理を行います。

---

## 概要

`model-routing` は、各タスクの種別と複雑度に応じて最適なAIモデルを選定します。
モデルが利用不可の場合は自動フォールバックを実行し、コスト追跡も行います。

---

## モデルカタログ

### Tier 1: プレミアムモデル
| モデル ID | 用途 | 強み |
|---|---|---|
| `gpt-5.6-sol` | 計画・設計・最終レビュー | 論理的思考、仕様策定、品質評価 |
| `claude-fable-5` | 複雑な実装・大規模変更・デバッグ | 大規模コード生成、コンテキスト保持 |

### Tier 2: 標準モデル
| モデル ID | 用途 | 強み |
|---|---|---|
| `antigravity` | 通常実装・軽微修正・Google Cloud | プラットフォーム統合、効率的 |
| `google-models` | 汎用タスク | 高速応答、低コスト |

---

## ルーティングロジック

### 入力パラメータ

```json
{
  "task_type": "implementation | planning | review | debugging | testing | deployment",
  "complexity": "low | medium | high | critical",
  "context": {
    "is_google_cloud": false,
    "implementation_model": null,
    "file_count": 5,
    "estimated_tokens": 10000
  }
}
```

### 選定アルゴリズム

```
1. タスク種別で第一候補を決定:
   - planning / design → gpt-5.6-sol
   - final_review → gpt-5.6-sol
   - complex_implementation → claude-fable-5
   - large_changes → claude-fable-5
   - unknown_bugs → claude-fable-5
   - normal_implementation → antigravity
   - minor_fixes → antigravity
   - google_cloud → antigravity

2. 制約チェック:
   - review タスクの場合:
     → implementation_model と異なるモデルを選定（必須）
   - コスト上限チェック:
     → 推定コストが残りバジェット以内か確認

3. 利用可能性チェック:
   → 選定モデルが利用可能か確認
   → 利用不可なら次の優先順位へフォールバック

4. 最終決定を返却
```

### 実装-レビューペアリング

実装とレビューで必ず異なるモデルを使用する:

| 実装モデル | レビューモデル |
|---|---|
| `claude-fable-5` | `gpt-5.6-sol` |
| `gpt-5.6-sol` | `claude-fable-5` |
| `antigravity` | `gpt-5.6-sol` または `claude-fable-5` |
| `google-models` | `gpt-5.6-sol` または `claude-fable-5` |

---

## フォールバックロジック

### フォールバック順序

```
Tier 1 優先モデル
  ↓ (利用不可)
Tier 1 代替モデル
  ↓ (利用不可)
Tier 2 モデル
  ↓ (利用不可)
エラー → 人間にエスカレーション
```

### 具体的なフォールバックチェーン

| 優先モデル | フォールバック 1 | フォールバック 2 | 最終手段 |
|---|---|---|---|
| `gpt-5.6-sol` | `claude-fable-5` | `antigravity` | 人間エスカレーション |
| `claude-fable-5` | `gpt-5.6-sol` | `antigravity` | 人間エスカレーション |
| `antigravity` | `google-models` | `claude-fable-5` | 人間エスカレーション |

### リトライポリシー

```json
{
  "max_retries": 3,
  "retry_delay_seconds": [5, 15, 30],
  "on_max_retries_exceeded": "escalate_to_human",
  "escalation_message": "モデル {model_id} が3回連続で利用不可です。手動での対応をお願いします。"
}
```

---

## コスト追跡

### トークン使用量の記録

```json
// .devcore/model-usage.json に追記
{
  "entries": [
    {
      "timestamp": "ISO8601",
      "task_id": "TASK-002",
      "model": "claude-fable-5",
      "phase": "implementation",
      "input_tokens": 8500,
      "output_tokens": 3200,
      "estimated_cost_usd": 0.045,
      "duration_seconds": 12
    }
  ],
  "daily_total": {
    "date": "2025-01-15",
    "total_tokens": 125000,
    "total_cost_usd": 1.85,
    "by_model": {
      "claude-fable-5": { "tokens": 80000, "cost": 1.20 },
      "gpt-5.6-sol": { "tokens": 35000, "cost": 0.55 },
      "antigravity": { "tokens": 10000, "cost": 0.10 }
    }
  }
}
```

### コスト制限

```json
// .devcore/cost-tracking.json
{
  "limits": {
    "per_task_usd": 5.00,
    "daily_usd": 20.00,
    "monthly_usd": 200.00
  },
  "current": {
    "today_usd": 3.45,
    "this_month_usd": 45.20
  },
  "alerts": {
    "warn_at_percent": 80,
    "block_at_percent": 100
  }
}
```

### コスト超過時の動作

1. **80%到達**: ユーザーに警告を表示
2. **100%到達**: 新しいタスクの実行をブロック、ユーザーに承認を求める
3. **承認後**: 制限をリセットまたは引き上げて続行

---

## モデル選定の記録

すべてのモデル選定を記録し、トレーサビリティを確保:

```json
{
  "routing_decision": {
    "task_id": "TASK-002",
    "phase": "implementation",
    "requested_at": "ISO8601",
    "input": {
      "task_type": "implementation",
      "complexity": "medium"
    },
    "decision": {
      "selected_model": "claude-fable-5",
      "reason": "中程度の複雑さの実装タスク",
      "fallback_used": false
    }
  }
}
```

---

## 注意事項

- モデルの利用可能性は実行時に動的に判定する
- コスト計算は推定値であり、実際の課金額とは異なる場合がある
- 新しいモデルが追加された場合は、このスキルのカタログを更新する
- 人間がモデルを明示的に指定した場合は、ルーティングロジックをオーバーライドする
