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

### Jobs（ジョブ管理）

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/jobs` | ジョブ作成・キュー投入 → `Job` |
| `GET` | `/jobs` | ジョブ一覧取得（新しい順） → `JobSummary[]` |
| `GET` | `/jobs/{job_id}` | ジョブ詳細取得 → `Job` |
| `GET` | `/jobs/{job_id}/logs` | ジョブログ取得（プレーンテキスト） |
| `GET` | `/jobs/{job_id}/results` | 学習結果取得 → `JobResults`（メトリクス・画像パス等） |
| `GET` | `/jobs/{job_id}/image` | 結果画像ファイル取得 |
| `GET` | `/jobs/{job_id}/weights` | 学習済みウェイトファイル取得 |
| `POST` | `/jobs/{job_id}/cancel` | ジョブのキャンセル |
| `DELETE` | `/jobs/{job_id}` | ジョブレコード削除（ファイルは残す） |

**POST `/jobs` リクエストボディ:**

```json
{
  "dataset_id": "string",
  "model": "yolov8n",
  "epochs": 50,
  "imgsz": 640,
  "batch": 16,
  "patience": 50,
  "optimizer": "auto",
  "lr0": 0.01,
  "lrf": 0.01,
  "name": "train"
}
```

**ジョブステータス値:** `queued` → `running` → `completed` / `failed` / `cancelled`

**`JobResults` レスポンス:**

```json
{
  "job_id": "string",
  "run_dir": "/path/to/runs/train/name",
  "weights": "/path/to/best.pt",
  "images": ["/path/to/results.png", ...],
  "metrics": { "precision": 0.95, ... },
  "metrics_history": [{ "epoch": 1, "train/box_loss": 0.5, ... }, ...]
}
```

### Training（旧エンドポイント、後方互換）

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/train/` | 学習ジョブ開始（BackgroundTasks で非同期実行）→ `{ job_id, status }` |
| `GET` | `/train/status/{job_id}` | ジョブ状態取得 → `{ id, status, logs[], progress, epoch, total_epochs, ... }` |

### Datasets（データセット管理）

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/datasets/upload` | ZIP アップロード・展開・data.yaml 検証 → `DatasetInfo` |
| `GET` | `/datasets` | データセット一覧取得（新しい順）→ `DatasetInfo[]` |
| `GET` | `/datasets/{dataset_id}` | データセット詳細取得 → `DatasetInfo` |

**`DatasetInfo` レスポンス:**

```json
{
  "dataset_id": "string",
  "image_count": 120,
  "classes": ["cat", "dog"],
  "created_at": "2026-04-11T00:00:00Z",
  "data_yaml": "/path/to/data.yaml",
  "path": "/path/to/datasets/dataset_id"
}
```

### Settings（設定管理）

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/settings` | アプリ設定取得 → `AppSettings` |
| `PUT` | `/settings` | アプリ設定更新（フル置換）→ `AppSettings` |

**`AppSettings` スキーマ:**

```json
{
  "default_model": "yolov8n",
  "default_epochs": 50,
  "default_imgsz": 640,
  "default_batch": 16,
  "max_concurrent_jobs": 4,
  "device_mode": "auto",
  "storage_note": ""
}
```

設定は `backend/data/settings.json` に永続化。ファイルが存在しない場合はデフォルト値を返す。

### Dashboard（集計サマリー）

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/dashboard/summary` | ジョブ統計・データセット統計・直近ジョブリストを集計して返す |

**レスポンス例:**

```json
{
  "job_stats": { "total": 10, "queued": 1, "running": 1, "completed": 7, "failed": 1 },
  "dataset_stats": { "total": 3 },
  "recent_jobs": [{ "job_id": "...", "name": "train", "status": "completed", "progress": 100 }]
}
```

### Prediction

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/predict/` | 推論実行 → `{ detections[], count }` |

### Health

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/health` | ヘルスチェック → `{ status: "ok" }` |

---

## 共通仕様

* Next.js API Routes: 全エンドポイントは NextAuth セッション検証必須（未認証 → `401 Unauthorized`）
* FastAPI: `BACKEND_URL` 環境変数で接続先を変更可能（デフォルト: `http://localhost:8000`）
* FastAPI エンドポイントは直接 `http://localhost:8000` にアクセス。**CORS** で `http://localhost:3000` が許可されている。
* レスポンス形式（Next.js エラー時）:

```json
{ "error": "メッセージ" }
```

* `GET /api/workspaces` — ワークスペース一覧（ページネーション対応）
* FastAPI `DELETE /train/{job_id}` — 学習ジョブ強制停止
* `GET /api/jobs`, `/api/models`, `/api/datasets` — ジョブ・モデル・データセット API（現在はモック）
