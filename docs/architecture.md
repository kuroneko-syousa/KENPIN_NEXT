# Architecture

## Tech Stack

| カテゴリ | 技術 |
|---|---|
| フレームワーク | Next.js 15 (App Router) |
| 認証 | NextAuth.js (Credentials / JWT) |
| UI | React 19, framer-motion |
| キャンバス | Konva.js (direct) |
| ORM | Prisma 7 |
| DB | SQLite (開発) |
| 言語 | TypeScript |
| CSS | Tailwind CSS + globals.css |

## Directory Structure

```
app/
  api/
    workspaces/           # GET(一覧), POST(作成), PATCH(更新), DELETE
      [id]/
        images/           # GET 画像一覧取得
    image-databases/      # GET(一覧), POST(作成), PUT(更新)
      [id]/
        images/           # GET 画像一覧取得
  dashboard/              # ダッシュボード全ページ
    workspaces/[id]/      # ワークスペーススタジオ

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
  └── ...（params / training / results は今後実装）
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
