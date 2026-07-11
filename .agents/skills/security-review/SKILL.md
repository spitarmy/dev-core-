---
name: security-review
description: >
  内部スキル。セキュリティレビューを実施する。API Key露出、インジェクション攻撃、
  認証バイパス、危険なコマンド実行、ファイルアクセスの脆弱性を検査する。
---

# security-review — セキュリティレビュー

> **種別:** 内部スキル（`dev-review` 等から呼び出される）
>
> コードのセキュリティ脆弱性を体系的に検査します。

---

## 概要

`security-review` は、以下のセキュリティ観点でコードを検査します:

1. **機密情報の露出**
2. **インジェクション攻撃**
3. **認証・認可バイパス**
4. **危険なコマンド実行**
5. **ファイルアクセスの脆弱性**
6. **依存関係の脆弱性**

---

## 検査項目

### 1. 機密情報の露出（Secret Exposure）

#### 検出パターン

```
# API Key / Token
/[A-Za-z0-9_-]{32,}/  （コンテキストに応じて）
/sk-[a-zA-Z0-9]{48}/   （OpenAI API Key）
/AIza[0-9A-Za-z-_]{35}/ （Google API Key）
/ghp_[a-zA-Z0-9]{36}/   （GitHub Personal Access Token）

# 環境変数の直書き
"password" = "..."
"secret" = "..."
"api_key" = "..."
"token" = "..."

# 接続文字列
/postgres:\/\/.*:.*@/
/mongodb:\/\/.*:.*@/
/redis:\/\/.*:.*@/
```

#### 検査対象

- ソースコード（`.ts`, `.js`, `.py`, `.go` 等）
- 設定ファイル（`.json`, `.yaml`, `.toml`）
- Docker関連ファイル（`Dockerfile`, `docker-compose.yml`）
- CI/CD設定（`.github/workflows/`）
- `.env` ファイル（`.env.example` 以外）

#### 安全な代替案

```json
{
  "finding": "API Key がソースコードにハードコードされています",
  "file": "src/lib/openai.ts",
  "line": 5,
  "current": "const apiKey = 'sk-abc123...';",
  "recommended": "const apiKey = process.env.OPENAI_API_KEY;",
  "severity": "critical"
}
```

### 2. インジェクション攻撃

#### 2.1 SQLインジェクション

```javascript
// 危険なパターン
const query = `SELECT * FROM users WHERE id = ${userId}`;
db.query(`DELETE FROM posts WHERE author = '${username}'`);

// 安全なパターン
const query = `SELECT * FROM users WHERE id = $1`;
db.query(query, [userId]);
```

#### 2.2 NoSQLインジェクション

```javascript
// 危険なパターン
db.collection('users').find({ email: req.body.email });

// 安全なパターン（入力のサニタイズ）
const email = String(req.body.email);
db.collection('users').find({ email });
```

#### 2.3 XSS（クロスサイトスクリプティング）

```javascript
// 危険なパターン
element.innerHTML = userInput;
dangerouslySetInnerHTML={{ __html: userContent }};

// 安全なパターン
element.textContent = userInput;
// React: JSXは自動エスケープ
<div>{userContent}</div>
```

#### 2.4 コマンドインジェクション

```javascript
// 危険なパターン
exec(`convert ${filename} output.png`);
child_process.exec(`grep ${searchTerm} /var/log/*`);

// 安全なパターン
execFile('convert', [filename, 'output.png']);
child_process.execFile('grep', [searchTerm, '/var/log/app.log']);
```

### 3. 認証・認可バイパス

#### チェック項目

- [ ] 認証が必要なエンドポイントにミドルウェアが適用されているか
- [ ] 認可チェック（他ユーザーのデータへのアクセス制御）
- [ ] JWT / Session の有効期限設定
- [ ] パスワードのハッシュ化（bcrypt / argon2）
- [ ] CORS設定の適切さ
- [ ] Rate Limiting の実装

```json
{
  "finding": "認証ミドルウェアが適用されていないエンドポイント",
  "file": "src/app/api/user/profile/route.ts",
  "issue": "PUT /api/user/profile に認証チェックがありません",
  "severity": "critical",
  "recommendation": "authMiddleware を適用する"
}
```

### 4. 危険なコマンド実行

#### 禁止コマンドパターン

| パターン | リスク |
|---|---|
| `rm -rf /` | ファイルシステム全削除 |
| `rm -rf ~` | ホームディレクトリ削除 |
| `eval()` | 任意コード実行 |
| `exec()` with user input | コマンドインジェクション |
| `sudo` | 権限昇格 |
| `chmod 777` | 過度な権限付与 |
| `curl \| sh` | 未検証スクリプト実行 |

#### 検出と報告

```json
{
  "finding": "危険なコマンドの使用を検出",
  "file": "scripts/cleanup.sh",
  "line": 12,
  "command": "rm -rf $DIR/*",
  "risk": "$DIR が空や / の場合、大規模な削除が発生する",
  "severity": "high",
  "recommendation": "変数の検証を追加: [[ -z \"$DIR\" ]] && exit 1"
}
```

### 5. ファイルアクセスの脆弱性

#### パストラバーサル

```javascript
// 危険なパターン
const filePath = path.join('/uploads', req.params.filename);
fs.readFile(filePath);
// req.params.filename = '../../etc/passwd' → /etc/passwd にアクセス可能

// 安全なパターン
const filename = path.basename(req.params.filename);
const filePath = path.join('/uploads', filename);
if (!filePath.startsWith('/uploads/')) {
  throw new Error('Invalid file path');
}
```

#### ファイルアップロード

- [ ] ファイルサイズ制限
- [ ] ファイルタイプ検証（拡張子 + マジックバイト）
- [ ] 保存先ディレクトリの制限
- [ ] 実行権限の除去
- [ ] ファイル名のサニタイズ

### 6. 依存関係の脆弱性

```bash
# npm
npm audit --json

# Python
pip-audit --format=json
safety check --json

# Go
govulncheck ./...
```

---

## レポート形式

```json
{
  "security_review": {
    "task_id": "TASK-002",
    "reviewed_at": "ISO8601",
    "overall_risk": "low | medium | high | critical",

    "findings": [
      {
        "id": "SEC-001",
        "category": "secret_exposure | injection | auth_bypass | dangerous_command | file_access | dependency",
        "severity": "critical | high | medium | low | info",
        "title": "簡潔なタイトル",
        "description": "詳細な説明",
        "file": "該当ファイル",
        "line": 0,
        "cwe": "CWE-xxx",
        "recommendation": "修正方法",
        "auto_fixable": true
      }
    ],

    "summary": {
      "critical": 0,
      "high": 1,
      "medium": 2,
      "low": 1,
      "info": 3
    },

    "dependency_audit": {
      "total_packages": 150,
      "vulnerabilities": 0,
      "last_checked": "ISO8601"
    }
  }
}
```

---

## 注意事項

- セキュリティの findings は severity が high 以上の場合、必ずブロッキングとする
- false positive を減らすため、コンテキストを考慮した判定を行う
- 新しい脆弱性パターンを発見した場合、検出ルールに追加する
- 修正提案は具体的なコード例を含める
