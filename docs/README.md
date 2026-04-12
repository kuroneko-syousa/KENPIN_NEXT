# Documentation

このディレクトリは Kenpin Studio の設計・仕様書をまとめたものです。

## Structure

* overview.md
  プロダクトの概要と目的

* architecture.md
  システム構成と技術スタック

* auth.md
  認証・認可の設計

* dashboard.md
  ダッシュボード仕様
  - **[NEW 2026-04-12]** 学習済みモデルの命名・改名（display_name）

* data-model.md
  データ構造定義（Prisma / Job モデル）
  - **[NEW 2026-04-12]** Job.display_name 追加

* storage-hierarchy.md
  **[NEW 2024-04-12]** マルチユーザー対応・ワークスペース別成果物管理
  - ディレクトリ構造（user_id/workspace_id 階層化）
  - API フロー
  - 実装の変更点

* api.md
  API設計
  - **[NEW 2026-04-12]** `PATCH /jobs/{job_id}/rename` 追加

* roadmap.md
  今後の開発計画

## How to Use

* 新機能を追加する場合は必ず該当ドキュメントを更新すること
* 仕様変更はPull Requestでレビューすること
