# Architecture

## Tech Stack

| カテゴリ | 技術 |
|---|---|
| フロントエンド | Next.js 15 (App Router) |
| 認証 | NextAuth.js (Credentials / JWT) |
| UI | React 19, framer-motion |
| キャンバス | Konva.js (direct) |
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
  dashboard/              # ダッシュボード全ページ
    workspaces/[id]/      # ワークスペーススタジオ

backend/                  # FastAPI Python バックエンド
  main.py                 # アプリエントリーポイント、CORS、ルーター登録
  start.bat               # 仮想環境アクティベート + uvicorn 起動
  requirements.txt
  routers/
    train.py              # POST /train/, GET /train/status/{job_id}
    predict.py            # POST /predict/
    dataset.py            # POST /upload-dataset/
  services/
    yolo_service.py       # YOLO 学習・推論ロジック（Ultralytics ラッパー）
    job_manager.py        # インメモリジョブ管理（1ジョブ同時実行制限）
  utils/
    logging_config.py
  datasets/               # アップロードZIP展開先
  runs/                   # YOLO 学習出力（runs/train/, runs/predict/）

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
  └── 学習タブ
       → POST /api/workspaces/[id]/prepare-training (dataset.yaml 生成)
       → POST /api/workspaces/[id]/start-training
            → POST http://localhost:8000/train/ (FastAPI)
            → BackgroundTasks で YOLO 学習を非同期実行
            → jobId を返却
       → GET /api/workspaces/[id]/start-training?jobId=xxx (SSE)
            → 2秒ポーリングで FastAPI GET /train/status/{job_id} を問い合わせ
            → ログ・エポック進捗をリアルタイムでフロントへ配信
```

## FastAPI Backend Architecture

```
backend/
  main.py (FastAPI app + CORS + router mounting)
   ├── POST /train/              → BackgroundTasks で yolo_service.run_training()
   ├── GET  /train/status/{id}   → job_manager から status/logs/progress を返す
   ├── POST /predict/            → yolo_service.run_prediction()
   ├── POST /upload-dataset/     → ZIP 受付・展開・data.yaml 検証
   └── GET  /health              → ヘルスチェック

  services/
    yolo_service.py
      run_training(job_id, ...)  → YOLO モデル学習
                                    on_train_epoch_end コールバックで
                                    job_manager.update_progress() を呼び出し
      run_prediction(...)        → YOLO 推論

    job_manager.py (singleton JobManager)
      create_job() / set_running() / set_done() / set_failed()
      add_log() / update_progress()
      is_busy()                  → 同時実行1ジョブ制限
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
