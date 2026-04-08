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
  konva-annotator.tsx     # アノテーター コンポジションルート
  workspace-studio.tsx    # ワークスペーススタジオ本体

types/
  annotate.ts             # BoxRegion / PolyRegion / AnnotateImage 型定義

prisma/
  schema.prisma           # User / Workspace / ImageDatabaseConnection
```

## Data Flow

```
User → NextAuth ログイン → JWT発行
  ↓
Dashboard → API Routes (Prisma → SQLite)
  ↓
Workspace Studio
  ├── 前処理タブ  → Canvas API でピクセル処理 → プレビュー表示
  │                → PATCH /api/workspaces/[id] (preprocessConfig 保存)
  ├── アノテーションタブ → KonvaAnnotator (studio/annotator/)
  │                      → PATCH /api/workspaces/[id] (annotationData 保存)
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

## Future

* WebSocket 対応（ジョブ進捗リアルタイム更新）
* ポリゴン・ポイントアノテーション対応
* Undo/Redo
* チーム管理・権限制御強化
