# マルチユーザー対応・ワークスペース別成果物分離

**2026-04-12 リリーズ** — 複数ユーザーとワークスペース単位での学習成果物の安全な保管システム

---

## 概要

従来：
- 全ユーザーの学習結果が `backend/runs/train/` に混在
- 複数ユーザーが同時学習するとデータが上書きされる危険

改善：
- 成果物を **`backend/workspaces/{user_id}/{workspace_id}/`** に 階層化
- ユーザー × ワークスペース単位で完全分離
- API 呼び出しも `{user_id}/{workspace_id}` で統一

---

## ディレクトリ構造

### 全体像

```
KENPIN_NEXT/
├── backend/
│   ├── workspaces/                    # [NEW] マルチユーザー成果物ルート
│   │   ├── user001/                   # User ID（Prisma User.id）
│   │   │   ├── workspace-abc/         # Workspace ID（Prisma Workspace.id）
│   │   │   │   ├── jobs/              # ジョブ作業ディレクトリ
│   │   │   │   │   ├── {job_id_1}/
│   │   │   │   │   │   ├── params.json        # 入力パラメータ（worker 読込）
│   │   │   │   │   │   ├── progress.json      # 進捗ファイル（ポーリング用）
│   │   │   │   │   │   ├── stop.request       # 停止リクエストフラグ
│   │   │   │   │   │   └── dataset/           # コピーされたデータセット
│   │   │   │   │   │       ├── images/
│   │   │   │   │   │       │   ├── train/
│   │   │   │   │   │       │   └── val/
│   │   │   │   │   │       ├── labels/
│   │   │   │   │   │       ├── classes.txt
│   │   │   │   │   │       └── data.yaml
│   │   │   │   │   └── {job_id_2}/
│   │   │   │   │       └── ...
│   │   │   │   ├── logs/               # ジョブログ（stdout + stderr）
│   │   │   │   │   ├── {job_id_1}.log
│   │   │   │   │   └── {job_id_2}.log
│   │   │   │   └── models/             # YOLO 訓練結果（成果物）
│   │   │   │       ├── exp/
│   │   │   │       │   ├── weights/
│   │   │   │       │   │   ├── best.pt        # ← 最適重み
│   │   │   │       │   │   ├── last.pt
│   │   │   │       │   │   └── best.yaml
│   │   │   │       │   ├── results.csv        # ← メトリクス
│   │   │   │       │   ├── confusion_matrix.png
│   │   │   │       │   ├── train_batch0.jpg
│   │   │   │       │   └── val_batch0_pred.jpg
│   │   │   │       ├── exp_2/
│   │   │   │       └── ...
│   │   │   └── workspace-def/
│   │   │       └── ...
│   │   ├── user002/
│   │   │   ├── workspace-xyz/
│   │   │   └── ...
│   │   └── ...
│   │
│   ├── data/                          # [既存] グローバル設定
│   │   ├── jobs.json                  # ジョブレコード（全ユーザー）
│   │   └── settings.json
│   │
│   ├── logs/                          # [既存] 後方互換
│   ├── runs/                          # [後方互換] レガシー出力
│   ├── jobs/                          # [後方互換] レガシー作業
│   └── ...
│
└── ...
```

### ファイル置き場の対応表

| 用途 | 保存先 | アクセス権 | 説明 |
|---|---|---|---|
| **訓練済みモデル** | `workspaces/{user_id}/{ws_id}/models/` | 当該 WS オーナー + admin | `best.pt`, `last.pt` 等 |
| **訓練ログ** | `workspaces/{user_id}/{ws_id}/logs/{job_id}.log` | 当該 WS オーナー + admin | stdout + stderr 統合 |
| **進捗ファイル** | `workspaces/{user_id}/{ws_id}/jobs/{job_id}/progress.json` | 内部使用 | ポーリング用（2秒更新） |
| **パラメータ** | `workspaces/{user_id}/{ws_id}/jobs/{job_id}/params.json` | 内部使用 | Worker 実行時読込 |
| **ジョブレコード** | `backend/data/jobs.json` | 全ユーザー | メタデータ（Prisma 代替） |
| **ワークスペース設定** | SQLite (Prisma) | Per-user | 前処理・アノテーション設定等 |

---

## API 呼び出しフロー

### フロント → バックエンド

```typescript
// 1. 学習開始時に workspace_path を構築
POST /api/workspaces/[id]/start-training
{
  workspace_id: "ws-abc-123",         // URL パラメータ
  user_id: workspace.ownerId,         // → Frontend で Prisma 取得
  workspace_path: "backend/workspaces/user-001/ws-abc-123",
  requested_by: "user@example.com",
  dataset_id: "ds-456",
  model: "yolov8n",
  epochs: 50,
  device: "auto",
  ...
}
```

### Frontend API → FastAPI バックエンド

```python
# 2. バックエンド側で workspace_path を使用
POST /jobs/
Headers: Content-Type: application/json
Body: JobCreate(
    workspace_id="ws-abc-123",
    user_id="user-001",
    workspace_path="backend/workspaces/user-001/ws-abc-123",
    requested_by="user@example.com",
    ...)

# 3. JobManager.submit_job() でディレクトリ生成
# → backend/workspaces/user-001/ws-abc-123/jobs/{job_id}/
#   backend/workspaces/user-001/ws-abc-123/logs/
#   backend/workspaces/user-001/ws-abc-123/models/

# 4. params.json に workspace_dir を追加
{
  "job_id": "...",
  "workspace_id": "ws-abc-123",
  "user_id": "user-001",
  "workspace_dir": "backend/workspaces/user-001/ws-abc-123",
  "progress_path": ".../progress.json",
  ...
}

# 5. subprocess で train_worker.py を実行
python train_worker.py params.json
```

### Worker 側处理

```python
# train_worker.py
params = json.load(params_path)
workspace_dir = params["workspace_dir"]

# YOLO のプロジェクト出力先を動的設定
project = f"{workspace_dir}/models"  # ← workspace 配下に自動生成

model = YOLO("yolov8n.pt")
model.train(
    data=data_yaml,
    epochs=50,
    project=project,     # ← 成果物がユーザー別に分離
    name="exp",
    ...)

# 結果: backend/workspaces/user-001/ws-abc-123/models/exp/best.pt
```

---

## Job モデル（Pydantic）

```python
class Job(BaseModel):
    job_id: str                        # UUID
    
    # [NEW] ワークスペース階層
    workspace_id: Optional[str]        # ワークスペース ID
    user_id: Optional[str]             # ユーザー ID
    workspace_path: Optional[str]      # 作業ディレクトリ:
                                       # backend/workspaces/{user_id}/{workspace_id}/
    
    # 実行者情報
    requested_by: Optional[str]        # ユーザーメール
    dataset_id: str                    # データセット ID
    
    # 状態
    status: JobStatus                  # queued | running | completed | failed | stopped
    progress: int                      # 0-100
    queue_position: Optional[int]      # 待機位置（queued時のみ）
    
    # ログ＆成果物
    logs_path: Optional[str]           # workspaces/{user_id}/{ws_id}/logs/{job_id}.log
    results_path: Optional[str]        # workspaces/{user_id}/{ws_id}/models/.../best.pt
    error: Optional[str]
    log_lines: List[str]
    log_total_lines: int
    
    # パラメータ
    model: str                         # yolov8n, yolov8s, ...
    yolo_version: str                  # 8.0.0, 8.1.x, ...
    env_path: str                      # venv パス
    dataset_source_path: Optional[str] # データセット源
    epochs: int
    imgsz: int
    batch: int
    name: str
    device: str
    ...
```

---

## 実装の変更点

### backend/services/job_manager.py

```python
def submit_job(self, req: JobCreate) -> Job:
    """workspace_path 配下に ディレクトリ構造を自動生成"""
    
    job = Job(
        workspace_id=req.workspace_id,
        user_id=req.user_id,
        workspace_path=req.workspace_path,  # [NEW]
        ...
    )
    
    # workspace 階層化ディレクトリ作成
    if job.workspace_path:
        workspace_base = Path(job.workspace_path)
    else:
        # フォールバック
        workspace_base = Path("backend") / "workspaces" / (job.user_id or "default") / (job.workspace_id or "ws")
    
    jobs_dir = workspace_base / "jobs"
    logs_dir = workspace_base / "logs"
    jobs_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)
    
    # ジョブディレクトリ
    job_dir = jobs_dir / job.job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    
    # params.json に workspace_dir を追加
    worker_params["workspace_dir"] = str(workspace_base)
    ...
```

### backend/workers/train_worker.py

```python
def _train(params: dict) -> None:
    """workspace_dir から YOLO 出力先を動的決定"""
    
    workspace_dir = Path(params.get("workspace_dir", ""))
    
    if workspace_dir:
        models_dir = workspace_dir / "models"
        models_dir.mkdir(parents=True, exist_ok=True)
        project = str(models_dir)
    else:
        # レガシーフォールバック
        project = str(Path(__file__).parent.parent / "runs" / "train")
    
    model = YOLO(model_key)
    model.train(
        data=data_yaml,
        project=project,  # ← 階層化！
        name=name,
        ...
    )
```

### app/api/workspaces/[id]/start-training/route.ts

```typescript
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  // workspace から owner_id を取得 → user_id とする
  const userId = workspace.ownerId;
  const workspacePath = path.join(
    process.cwd(),
    "backend",
    "workspaces",
    userId,
    id
  );
  
  await fetch(`${BACKEND_URL}/jobs/`, {
    method: "POST",
    body: JSON.stringify({
      workspace_id: id,
      user_id: userId,           // [NEW]
      workspace_path: workspacePath,  // [NEW]
      requested_by: session.user.email,
      ...
    }),
  });
}
```

---

## 次のステップ

### Model/Dataset 一覧 API（ワークスペース別）

```python
# GET /workspaces/{user_id}/{workspace_id}/models
# → backend/workspaces/{user_id}/{workspace_id}/models/ を走査
# → [{ name: "exp", weights: "best.pt", metrics: {...} }, ...]

# GET /workspaces/{user_id}/{workspace_id}/datasets
# → ワークスペース配下に保存されたデータセットを一覧
```

### フロント側 UI 修正

```typescript
// models/datasets タブから層分け API を呼び出し
const workspace = useWorkspaceContext();
const { data: models } = useQuery({
  queryKey: ["models", workspace.ownerId, workspace.id],
  queryFn: () => fetch(
    `/api/workspaces/models?user_id=${workspace.ownerId}&ws_id=${workspace.id}`
  ).then(r => r.json()),
});
```

---

## メリット

✅ **完全分離** — ユーザー間でデータが混在しない  
✅ **スケーラブル** — ユーザー数が増減しても構造は同じ  
✅ **統一インターフェース** — `{user_id}/{workspace_id}` で全 API 一貫  
✅ **バックアップ容易** — ユーザー単位や WS 単位でディレクトリごと backup 可能  
✅ **権限制御対応** — 今後の ACL 実装時に階層別権限設定が容易  

---

## トラブルシュート

### Q. 既存の学習結果（`backend/runs/train/`）はどうする？

A. レガシーデータです。以下のいずれかで対応してください。
- バックアップして削除
- スクリプトで `workspaces/` に移行
- 当面は両方運用

### Q. workspace_path がない場合？

A. JobManager が自動生成：`backend/workspaces/default/workspace/`

### Q. ユーザーが削除される場合？

A. `backend/workspaces/{user_id}/` フォルダをそのまま削除（DB cascade 削除と同時推奨）

### Q. ワークスペースを別ユーザーに移譲する場合？

A. `workspace.ownerId` を更新し、`backend/workspaces/old_user/ws_id/` を `backend/workspaces/new_user/ws_id/` に移動

---

## 参考ドキュメント

- [Architecture（全体設計）](./architecture.md)
- [Data Model（Prisma スキーマ）](./data-model.md)
