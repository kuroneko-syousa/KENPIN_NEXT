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

## Phase 3 ✅ 完了（AI 学習バックエンド）

* **FastAPI バックエンド導入**（`backend/` ディレクトリ）
  * Ultralytics YOLO による モデル学習・推論
  * 非同期バックグラウンドジョブ（BackgroundTasks）
  * インメモリジョブ管理（同時1ジョブ制限）
  * エポック単位のログ・進捗トラッキング
  * CUDA 自動検出 / CPU フォールバック
  * 学習ジョブ: `POST /train/`, `GET /train/status/{job_id}`
  * ヘルスチェック: `GET /health`
* **Next.js ↔ FastAPI 連携**
  * `start-training/route.ts` を FastAPI 経由に刷新（Python サブプロセス廃止）
  * 2秒ポーリング + SSE でエポック進捗をフロントへリアルタイム配信
* **バックエンド自動起動**（`start-dev.bat` から別ウィンドウで起動）
* **Python 仮想環境**（`backend/.venv`、`backend/start.bat` でセットアップ）

## Phase 4 🔄 進行中

* ポリゴン・ポイントアノテーション対応
* Undo/Redo
* アノテーター スマートズーム・スクロール対応
* 学習結果ビューア（metrics、混同行列、val 画像）
* FastAPI `DELETE /train/{job_id}` — 学習ジョブ強制停止

## Phase 5

* ジョブ・モデル API 実装（モックから本実装へ、DB 永続化）
* WebSocket 対応（SSE ポーリングから移行）
* データセット品質チェック強化
* 学習済みモデルの管理・デプロイ UI

## Phase 6

* チーム管理・権限制御強化
* OAuth 対応（Google など）
* 本番運用（DB 移行・デプロイ）
