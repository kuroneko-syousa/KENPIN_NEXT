# API Design

## Next.js API Routes（フロントエンド側）

### Workspaces

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/api/workspaces` | ワークスペース作成 |
| `GET` | `/api/workspaces/[id]` | ワークスペース詳細取得 |
| `PATCH` | `/api/workspaces/[id]` | ワークスペース更新（annotationData / preprocessConfig 含む） |
| `DELETE` | `/api/workspaces/[id]` | ワークスペース削除 |
| `GET` | `/api/workspaces/[id]/images` | ワークスペース関連画像一覧 |
| `POST` | `/api/workspaces/[id]/prepare-training` | dataset.yaml 生成（学習前準備） |
| `POST` | `/api/workspaces/[id]/start-training` | 学習開始（FastAPI バックエンドへ委譲）→ `{ jobId, model, epochs }` |
| `GET` | `/api/workspaces/[id]/start-training?jobId=xxx` | 学習進捗 SSE ストリーム（ログ・エポック・完了イベント） |
| `DELETE` | `/api/workspaces/[id]/start-training?jobId=xxx` | 学習中断 |

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

## FastAPI バックエンド（`http://localhost:8000`）

> ドキュメントは起動後 http://localhost:8000/docs で確認可能。

### Training

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/train/` | 学習ジョブ開始（BackgroundTasks で非同期実行）→ `{ job_id, status }` |
| `GET` | `/train/status/{job_id}` | ジョブ状態取得 → `{ id, status, logs[], progress, epoch, total_epochs, ... }` |

**POST `/train/` リクエストボディ:**

```json
{
  "data_yaml": "/absolute/path/to/dataset.yaml",
  "model": "yolov8n.pt",
  "epochs": 100,
  "imgsz": 640,
  "batch": 16,
  "patience": 50,
  "optimizer": "auto",
  "lr0": 0.01,
  "lrf": 0.01,
  "name": "train"
}
```

**ジョブステータス値:** `pending` → `running` → `done` / `failed`

### Prediction

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/predict/` | 推論実行 → `{ detections[], count }` |

### Dataset

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/upload-dataset/` | ZIP アップロード・展開・data.yaml 検証 |

### Health

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/health` | ヘルスチェック → `{ status: "ok" }` |

---

## 共通仕様

* Next.js API Routes: 全エンドポイントは NextAuth セッション検証必須（未認証 → `401 Unauthorized`）
* FastAPI: `BACKEND_URL` 環境変数で接続先を変更可能（デフォルト: `http://localhost:8000`）
* レスポンス形式（Next.js）:

```json
{ "error": "メッセージ" }
```

---

## Future

* `GET /api/workspaces` — ワークスペース一覧（ページネーション対応）
* FastAPI `DELETE /train/{job_id}` — 学習ジョブ強制停止
* `GET /api/jobs`, `/api/models`, `/api/datasets` — ジョブ・モデル・データセット API（現在はモック）
