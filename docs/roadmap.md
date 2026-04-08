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

## Phase 3 🔄 進行中

* ポリゴン・ポイントアノテーション対応
* Undo/Redo
* アノテーター スマートズーム・スクロール対応

## Phase 4

* ジョブ・モデル API 実装（モックから本実装へ）
* WebSocket 対応（ジョブ進捗リアルタイム更新）
* データセット品質チェック強化

## Phase 5

* チーム管理・権限制御強化
* OAuth 対応（Google など）
* 本番運用（DB 移行・デプロイ）
