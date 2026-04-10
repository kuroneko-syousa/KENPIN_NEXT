# Roadmap

## Phase 1 ✅ 完了

* ダッシュボード UI（概要・モデル・ジョブ・データセット・DB）
* 認証（NextAuth.js Credentials / JWT）
* Prisma + SQLite によるユーザー・ワークスペース・画像DB永続化

## Phase 2 ✅ 完了（主要機能）

* 画像DB接続管理 CRUD
* ワークスペース CRUD
* ワークスペーススタジオ（前処理・アノテーション・エクスポート）
  * Canvas API ベース前処理（リサイズ・二値化・色調調整・フリップ等）
  * Konva.js BBox アノテーター（クラス管理・YOLO エクスポート）
  * アノテーターのモジュール分割アーキテクチャ（`studio/annotator/`）
  * 前処理設定 DB 保存 + アノテーション時自動適用
  * **リソースからインポート**（登録済み `imageFolder` を API 経由で自動読込）
  * **前処理設定の永続化バグ修正**（タブ切替・再インポート時も最新設定を維持）
  * **アノテーション状況パネル**（ドーナツチャート・クラス別バー・整合性チェック）

## Phase 3 ✅ 完了（AI 学習バックエンド全面刷新）

* **FastAPI バックエンド全面整備**（`backend/` ディレクトリ）
  * Ultralytics YOLO による モデル学習・推論
  * **非同期サブプロセスジョブ**（asyncio + subprocess、キャンセル対応）
  * **JSON ファイルジョブ永続化**（`backend/data/jobs.json`、スレッドセーフ、再起動後も復元）
  * エポック単位のログ・進捗トラッキング
  * CUDA 自動検出 / CPU フォールバック
  * **Jobs API**: `POST /jobs`, `GET /jobs`, `GET /jobs/{id}`, `GET /jobs/{id}/logs`, `GET /jobs/{id}/results`, `POST /jobs/{id}/cancel`
  * **Datasets API**: `POST /datasets/upload`, `GET /datasets`, `GET /datasets/{id}`
  * **Settings API**: `GET /settings`, `PUT /settings`（設定を `data/settings.json` に永続化）
  * **Dashboard API**: `GET /dashboard/summary`（ジョブ統計・データセット数・直近ジョブを集計）
  * ヘルスチェック: `GET /health`
* **フロントエンド全ページ API 連携**（モックデータ → FastAPI 実データに置き換え）
  * ジョブページ・モデルページ・データセットページ・設定ページ等
* **@tanstack/react-query 導入**（インストール済み）
* **Next.js ↔ FastAPI 連携**（`start-training/route.ts` → FastAPI 経由）
* **バックエンド自動起動**（`start-dev.bat` から別ウィンドウで起動）
* **Python 仮想環境**（`backend/.venv`、`backend/start.bat` でセットアップ）

## Phase 4 🔄 進行中

* React Query プロバイダー設定（`app/providers.tsx`、`app/layout.tsx`）
* StatusBadge コンポーネント（`running: 青`, `completed: 緑`, `failed: 赤`）
* ジョブ監視ページでのポーリング（5 秒ごとに `/jobs` 再取得）
* 学習進捗パネルのページ横断表示（ナビゲーション後も消えない）
* 学習ログのリアルタイム詳細表示（SSE / 高頻度ポーリング）
* ワークスペースを開いた際の自動リソースインポート（前処理・アノテーションタブ）

## Phase 5

* 学習結果ビューア（metrics グラフ、混同行列、val 画像）
* ポリゴン・ポイントアノテーション対応
* Undo/Redo
* アノテーター スマートズーム・スクロール対応

## Phase 6

* チーム管理・権限制御強化
* OAuth 対応（Google など）
* 本番運用（DB 移行・デプロイ）
