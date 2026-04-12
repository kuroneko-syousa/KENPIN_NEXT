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
    job_id: str                        # UUID
    workspace_id: Optional[str]        # ワークスペース ID
    requested_by: Optional[str]        # リクエスタ（ユーザーメール）
    user_id: Optional[str]             # ユーザー ID（ワークスペース階層用）
    workspace_path: Optional[str]      # ワークスペース作業ディレクトリ
                                       # 例: /path/to/backend/workspaces/{user_id}/{workspace_id}/
    dataset_id: str                    # 使用データセット ID
    model: str                         # YOLO モデルキー（例: "yolov8n"）
    yolo_version: str                  # venv内 YOLO バージョン
    env_path: str                      # venv ルートパス
    status: JobStatus                  # queued | running | completed | failed | stopped
    progress: int                      # 0〜100（エポック進捗 %）
    created_at: datetime
    logs_path: Optional[str]           # train.log ファイルパス
                                       # 例: /path/to/workspaces/{user_id}/{workspace_id}/logs/{job_id}.log
    results_path: Optional[str]        # best.pt ファイルパス（学習完了後に設定）
    error: Optional[str]               # エラーメッセージ
    queue_position: Optional[int]      # 待機位置（status=queued時）
    log_lines: List[str]               # 最新ログ（デフォルト200行）
    log_total_lines: int               # ログ総行数（単調増加）
    
    # 学習ハイパーパラメータ
    dataset_source_path: Optional[str] # データセット源ディレクトリ
    epochs: int
    imgsz: int
    batch: int
    name: str                          # ラン名（例: "exp"）
    patience: int
    optimizer: str
    lr0: float
    lrf: float
    device: str                        # auto | cpu | cuda
    
    # 制御フラグ
    cancel_requested: bool             # ユーザー停止リクエスト
    locked: bool                       # 削除操作保護
```

### 出力構造（2024年4月12日更新）

**マルチユーザー対応**による保存階層化：

```
backend/
  workspaces/
    {user_id}/                  # ユーザーごとのディレクトリ
      {workspace_id}/
        jobs/                   # ジョブ作業ファイル
          {job_id}/
            params.json         # 入力パラメータ
            progress.json       # 進捗ファイル（ポーリング用）
            stop.request        # 停止リクエストファイル
            dataset/            # コピーされたデータセット
        logs/                   # ジョブログ
          {job_id}.log
        models/                 # YOLO 訓練結果
          exp/
            weights/
              best.pt           # 最適重み
              last.pt
              best.yaml
            results.csv         # メトリクスCSV
          ...
```

**API 呼び出し**（ユーザー→ワークスペース階層）：

```typescript
// フロント: start-training から送信
POST /jobs/
{
  user_id: "{user_id}",
  workspace_id: "{workspace_id}",
  workspace_path: "backend/workspaces/{user_id}/{workspace_id}",
  requested_by: "user@example.com",
  dataset_id: "{dataset_id}",
  ...
}
```

---

## ダッシュボード表示データ

ダッシュボード概要カードは `GET /dashboard/summary` API から取得したリアルタイムデータで動作。
将来的に実APIへ移行予定。

モックモデル: Job / Model / Dataset / ImageDatabase（表示専用）
