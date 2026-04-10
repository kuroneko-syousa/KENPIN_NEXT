# Data Model

## Prisma スキーマ（実装済み）

### User

| フィールド | 型 | 説明 |
|---|---|---|
| id | String (cuid) | PK |
| name | String | 表示名 |
| email | String (unique) | メールアドレス |
| role | String | `admin` / `user` |
| team | String | チーム名 |
| createdAt | DateTime | 作成日時 |
| updatedAt | DateTime | 更新日時 |
| workspaces | Workspace[] | リレーション |
| imageDatabases | ImageDatabaseConnection[] | リレーション |

### Workspace

| フィールド | 型 | 説明 |
|---|---|---|
| id | String (cuid) | PK |
| name | String | ワークスペース名 |
| target | String | タスク種別（物体検出など） |
| selectedModel | String | 選択モデル |
| imageFolder | String | 画像リソースフォルダパス |
| datasetFolder | String | 出力フォルダパス |
| databaseId | String | 接続DB ID |
| databaseType | String | DB種別 |
| annotationExportPath | String | YOLO エクスポート先パス |
| annotationData | String | アノテーションJSON（`AnnotateImage[]`） |
| preprocessConfig | String | 前処理設定JSON（`PreprocessConfig`） |
| status | String | `draft` / `active` など |
| ownerId | String | FK → User |

### ImageDatabaseConnection

| フィールド | 型 | 説明 |
|---|---|---|
| id | String (cuid) | PK |
| name | String | 接続名 |
| connectionType | String | 接続種別 |
| mountName | String | マウント名 |
| mountPath | String | マウントパス |
| storageEngine | String | ストレージエンジン |
| endpoint | String | エンドポイント |
| accessMode | String | アクセスモード |
| status | String | `Connected` / `Read Only` / `Error` |
| purpose | String | 用途 |
| notes | String | メモ |
| imageCount | Int | 総画像数 |
| ownerId | String | FK → User |

---

## アノテーション型（`types/annotate.ts`）

```ts
type BoxRegion   = { type: "box";     id: string; cls?: string; x: number; y: number; w: number; h: number };
type PolyRegion  = { type: "polygon"; id: string; cls?: string; points: Array<[number, number]> };
type PointRegion = { type: "point";   id: string; cls?: string; x: number; y: number };
type AnyRegion   = BoxRegion | PolyRegion | PointRegion;

type AnnotateImage = {
  src: string;
  name: string;
  regions: AnyRegion[];
};

type DrawTool = "select" | "box" | "polygon" | "point";
```

座標系はすべて **正規化座標（0.0〜1.0）** で管理。YOLO フォーマットへの変換は `boxRegionToYoloLine()` で行う。

---

## ジョブモデル（`backend/models/job.py`）

FastAPI バックエンドで管理されるジョブレコード。`backend/data/jobs.json` に永続化。

```python
class Job(BaseModel):
    job_id: str           # UUID
    name: str             # 学習ラン名（例: "train20260411_001"）
    status: JobStatus     # queued | running | completed | failed | cancelled
    progress: int         # 0〜100（エポック進捗 %）
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    dataset_id: str       # 使用データセット ID
    model: str            # YOLO モデルキー（例: "yolov8n"）
    epochs: int
    imgsz: int
    batch: int
    log_path: Optional[str]      # train.log ファイルパス
    results_path: Optional[str]  # best.pt ファイルパス
    error_msg: Optional[str]
```

---

## ダッシュボード表示データ

ダッシュボード概要カードは `GET /dashboard/summary` API から取得したリアルタイムデータで動作。
将来的に実APIへ移行予定。

モックモデル: Job / Model / Dataset / ImageDatabase（表示専用）
