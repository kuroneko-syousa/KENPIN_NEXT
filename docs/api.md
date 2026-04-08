# API Design

## 実装済みエンドポイント

### Workspaces

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/api/workspaces` | ワークスペース作成 |
| `GET` | `/api/workspaces/[id]` | ワークスペース詳細取得 |
| `PATCH` | `/api/workspaces/[id]` | ワークスペース更新（annotationData / preprocessConfig 含む） |
| `DELETE` | `/api/workspaces/[id]` | ワークスペース削除 |
| `GET` | `/api/workspaces/[id]/images` | ワークスペース関連画像一覧 |

### Image Databases

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/image-databases` | 接続DB一覧取得 |
| `POST` | `/api/image-databases` | 接続DB登録 |
| `PUT` | `/api/image-databases/[id]` | 接続DB更新 |
| `DELETE` | `/api/image-databases/[id]` | 接続DB削除 |
| `GET` | `/api/image-databases/[id]/images` | DB内画像一覧取得 |

### Auth

| パス | 説明 |
|---|---|
| `/api/auth/[...nextauth]` | NextAuth.js ハンドラ（Credentials / JWT） |

---

## 共通仕様

* 全エンドポイントは NextAuth セッション検証必須（未認証 → `401 Unauthorized`）
* レスポンス形式:

```json
{ "data": {}, "error": null }
```

* エラー時:

```json
{ "error": "メッセージ" }
```

---

## Future

* `GET /api/workspaces` — ワークスペース一覧（ページネーション対応）
* `POST /api/workspaces/[id]/export` — YOLO フォーマットエクスポート（サーバーサイドファイル書き出し）
* `GET /api/jobs`, `/api/models`, `/api/datasets` — ジョブ・モデル・データセット API（現在はモック）
