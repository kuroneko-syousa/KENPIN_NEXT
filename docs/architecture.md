# Architecture

## Tech Stack

| カテゴリ | 技術 |
|---|---|
| フロントエンド | Next.js 15 (App Router) |
| 認証 | NextAuth.js (Credentials / JWT) |
| UI | React 19, framer-motion |
| キャンバス | Konva.js (direct) |
| データフェッチ | @tanstack/react-query |
| ORM | Prisma 7 |
| DB | SQLite (開発) |
| 言語 | TypeScript (front) / Python 3.10 (backend) |
| CSS | Tailwind CSS + globals.css |
| AI バックエンド | FastAPI + Uvicorn |
| AI ライブラリ | Ultralytics YOLO |
| デバイス | CUDA 自動検出、フォールバック CPU |

## Directory Structure

```
app/
  api/
    workspaces/           # GET(一覧), POST(作成), PATCH(更新), DELETE
      [id]/
        images/           # GET 画像一覧取得
        start-training/   # POST(学習開始→FastAPIへ委譲), GET(SSEストリーム), DELETE(中断)
        prepare-training/ # POST(dataset.yaml生成)
    image-databases/      # GET(一覧), POST(作成), PUT(更新)
      [id]/
        images/           # GET 画像一覧取得
  dashboard/              # ダッシュボード全ページ（API→FastAPIから集計データ取得）
    workspaces/[id]/      # ワークスペーススタジオ

backend/                  # FastAPI Python バックエンド
  main.py                 # アプリエントリーポイント、CORS、ルーター登録
  start.bat               # 仮想環境アクティベート + uvicorn 起動
  requirements.txt
  models/
    job.py                # Job / JobCreate / JobSummary / JobStatus
  routers/
    jobs.py               # POST/GET/DELETE /jobs, /jobs/{id}/logs, /jobs/{id}/results
    dataset.py            # POST /datasets/upload, GET /datasets, GET /datasets/{id}
    settings.py           # GET/PUT /settings
    dashboard.py          # GET /dashboard/summary
    train.py              # POST /train/, GET /train/status/{job_id}（後方互換）
    predict.py            # POST /predict/
  services/
    yolo_service.py       # YOLO 学習・推論ロジック（Ultralytics ラッパー）
    job_store.py          # JSON ファイル永続化（スレッドセーフ）
    job_manager.py        # FIFO ジョブキュー管理（単一ディスパッチャ、順次実行）
  workers/
    train_worker.py       # スタンドアロン学習ワーカー（subprocess で実行）
  utils/
    logging_config.py
  data/
    jobs.json             # ジョブレコード永続化
    settings.json         # アプリ設定永続化
  datasets/               # アップロードZIP展開先
  runs/                   # YOLO 学習出力（後方互換：runs/train/, runs/predict/）
  workspaces/             # **[NEW 2024-04-12]** ユーザー/ワークスペース別成果物ディレクトリ
    {user_id}/
      {workspace_id}/
        jobs/             # ジョブ作業ファイル (params.json, progress.json, stop.request)
        logs/             # ジョブログ ({job_id}.log)
        models/           # YOLO 訓練結果（best.pt, results.csv 等）

components/
  studio/
    annotator/            # アノテーター モジュール群
      useAnnotatorState.ts    # 状態・CRUD フック
      AnnotatorCanvas.tsx     # Konva Stage/Layer + マウスイベント
      AnnotationSidebar.tsx   # 左パネル UI（ステートレス）
      ImageListSidebar.tsx    # 右サイドバー UI（ステートレス）
      Topbar.tsx              # トップバー UI（ステートレス）
      hooks/
        useBoxDraw.ts         # BBox ドラッグ描画 純粋ロジック
    annotation/           # アノテーションタブ UI コンポーネント群
      AnnotationStats.tsx     # 完了率ドーナツ + クラス別バー + 整合性チェック
      AnnotationSummary.tsx   # YOLO エクスポートパネル
      AnnotationToolbar.tsx   # アノテーター起動ボタン
      ImageUploader.tsx       # 画像インポートパネル
    preprocess/           # 前処理タブ UI コンポーネント群
      PreviewCanvas.tsx
      FullscreenPreview.tsx
      PreprocessPanel.tsx
      CropSelector.tsx
  konva-annotator.tsx     # アノテーター コンポジションルート
  workspace-studio.tsx    # ワークスペーススタジオ本体

hooks/
  useAnnotation.ts        # アノテーションタブ全状態管理 + annotationStats 算出
  usePreprocess.ts        # 前処理タブ全状態管理 + onConfigSaved コールバック

lib/
  annotation/
    exportYOLO.ts         # YOLO フォーマットエクスポート
    importImages.ts       # File[] → AnnotateImage[] 変換（前処理適用込み）
  preprocess/
    applyPreprocess.ts    # Canvas API ピクセル処理
```

## Data Flow

### フロントエンド ワークスペースフロー

```
User → NextAuth ログイン → JWT発行
  ↓
Dashboard → API Routes (Prisma → SQLite)
  ↓
Workspace Studio (WorkspaceStudio)
  │  livePreprocessConfig ステートで前処理設定を全タブに伝播
  │
  ├── 前処理タブ (PreprocessTab + usePreprocess)
  │    → Canvas API でピクセル処理 → Before/After プレビュー
  │    → PATCH /api/workspaces/[id] (preprocessConfig 保存)
  │    → onConfigSaved() → livePreprocessConfig 更新
  │
  ├── アノテーションタブ (AnnotationTabWithShare + useAnnotation)
  │    → GET /api/workspaces/[id]/images → 画像取得
  │    → applyPreprocessToDataUrl() で前処理適用（元画像変更なし）
  │    → KonvaAnnotator (studio/annotator/) でアノテーション
  │    → PATCH /api/workspaces/[id] (annotationData 保存)
  │    → AnnotationStats でリアルタイム整合性チェック
  │
  └── 学習タブ (TrainingTab)
       → POST /api/workspaces/[id]/prepare-training (dataset.yaml 生成)
       → POST /api/workspaces/[id]/start-training
            │  [NEW 2024-04-12] user_id + workspace_path を送信
            │
            └→ FastAPI: POST /jobs/
                 │  JobManager: FIFO キュー登録
                 │  work dir: backend/workspaces/{user_id}/{workspace_id}/
                 ↓
            return { fastapiJobId, status: "queued" }
       
       → GET /api/workspaces/[id]/start-training?jobId=xxx (SSE)
            → 1秒ポーリングで FastAPI GET /jobs/{job_id} を問い合わせ
            → status: queued → running → completed | failed
            → ログ・エポック進捗・待機位置をリアルタイム配信
            → queued フェーズ: 「待ち順: X番目」表示
            → running フェーズ: エポック進捗 % 表示
```

### バックエンド ジョブキュー制御フロー（FIFO単一ディスパッチャ）

```
POST /jobs/ (create_job, req: JobCreate)
  ↓
JobManager.submit_job(req)
  ├─ Job オブジェクト作成
  ├─ workspace_path = "backend/workspaces/{user_id}/{workspace_id}/"
  ├─ ディレクトリ生成
  │   ├─ {workplace}/jobs/{job_id}/ (params.json, progress.json, stop.request)
  │   ├─ {workplace}/logs/{job_id}.log
  │   └─ {workplace}/models/ (YOLO 出力先)
  ├─ params.json 書き出し { ..., workspace_dir, progress_path, stop_path }
  ├─ Job ストア永続化 (data/jobs.json)
  ├─ キューに push
  └─ Job 返却 (status: queued, queue_position: 1)

┌─── Dispatcher Thread (FIFO 単一実行) ───────
│  while True:
│    job_id = _queue.pop(0)  ← 1件ずつ取出し
│    _run_subprocess(job_id, params_path, progress_path)
│      ├─ subprocess.Popen([python, train_worker.py, params_path])
│      ├─ _monitor_process() で progress.json をポーリング
│      └─ Job ステート: queued → running → completed | failed
│
│  他ジョブは待機（キューに蓄積）
└────────────────────────────────────────────

Job Status Transition:
  queued (waiting)
    ↓ [dispatcher が取出し、subprocess 起動]
  running (training in progress)
    ↓ [subprocess exits normally]
  completed (success) or failed (error)
    ↓ [queue_position = None]
  (Next queued job → running)

GET /jobs/{job_id}
  ↓
  if status == queued:
    return { status: "queued", queue_position: N, queued_ahead: N-1, queue_size: M }
  else:
    return { status: "running"|"completed"|"failed", progress: %, queue_position: null }
```

## FastAPI Backend Architecture

```
backend/
  main.py (FastAPI app + CORS + router mounting)
   ├── /jobs/*                   → routers/jobs.py
   ├── /datasets/*               → routers/dataset.py
   ├── /settings/*               → routers/settings.py
   ├── /dashboard/*              → routers/dashboard.py
   ├── /train/*                  → routers/train.py（後方互換）
   ├── /predict/*                → routers/predict.py
   └── GET /health               → ヘルスチェック

  models/
    job.py                       → Job / JobCreate / JobSummary / JobStatus Pydantic モデル
                                   [NEW 2024-04-12] user_id, workspace_path フィールド追加

  services/
    job_store.py (JobStore)      → jobs.json から読込・書込（JSON ファイル永続化、スレッドセーフ）
      save() / get() / list() / delete()

    job_manager.py (JobManager)  → FIFO キュー制御 + JobStore ラッパー
      [NEW 2024-04-12] 単一ディスパッチャスレッド実装
      
      submit_job()               → Job 作成 + キュー登録 + workspace 階層化
                                   workspace_path= backend/workspaces/{user_id}/{workspace_id}/
                                   jobs/ + logs/ + models/ ディレクトリ自動生成
      
      _dispatch_loop()           → FIFO キュー 1件ずつ取出し・実行
                                   queued → running → completed|failed 順次遷移
      
      _run_subprocess()          → train_worker.py を subprocess で実行
                                   params.json に workspace_dir を含める
      
      get_queue_position()       → queued ジョブの待機位置（1-indexed）
      get_queue_size()           → 全キュー size
      cancel_job() / stop_job()  → キュー内ジョブ除去 / running ジョブ停止

    yolo_service.py              → [後方互換] YOLO 学習・推論ラッパー

  workers/
    train_worker.py              → [NEW 2024-04-12] スタンドアロン学習プロセス
                                   params.json 読み込み → workspace_dir から project path 動的決定
                                   backend/workspaces/{user_id}/{workspace_id}/models/ 出力

  data/
    jobs.json                    → ジョブレコード永続化ファイル（起動時に自動ロード）
    settings.json                → アプリ設定永続化ファイル
```

## Annotator Module Architecture

```
KonvaAnnotator (composition root)
 ├── useAnnotatorState      ← state / CRUD
 ├── AnnotatorCanvas        ← Konva + drawing
 │   └── useBoxDraw         ← drag geometry
 ├── AnnotationSidebar      ← left panel UI
 ├── ImageListSidebar       ← right sidebar UI
 └── Topbar                 ← navigation + save
```

## Annotation Stats Architecture

```
useAnnotation (hook)
 └── annotationStats (useMemo)
      ├── total / annotated / unannotated カウント
      ├── classCounts: Record<string, number>   クラス別リージョン集計
      └── issues: AnnotationIssue[]             整合性チェック結果
           ├── ERROR: 未登録クラスのリージョン
           ├── WARNING: 未アノテーション画像
           └── WARNING: リージョン0件のクラス

AnnotationStats (component)
 ├── DonutChart (SVG inline) ← annotated / total
 ├── クラス別バーチャート     ← classCounts
 └── issues リスト           ← 整合性チェック結果表示
```

## Future

* WebSocket 対応（ジョブ進捗リアルタイム更新）
* ポリゴン・ポイントアノテーション対応
* Undo/Redo
* チーム管理・権限制御強化
