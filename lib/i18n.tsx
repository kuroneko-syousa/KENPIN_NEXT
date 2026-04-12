"use client";

import { createContext, useContext, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Locale = "ja" | "en";

const STORAGE_KEY = "kenpin-ui-settings";

// ─── Translation Map ──────────────────────────────────────────────────────────

export interface TranslationMap {
  // Navigation
  nav_overview: string;
  nav_overview_desc: string;
  nav_workspaces: string;
  nav_workspaces_desc: string;
  nav_image_db: string;
  nav_image_db_desc: string;
  nav_datasets: string;
  nav_datasets_desc: string;
  nav_models: string;
  nav_models_desc: string;
  nav_jobs: string;
  nav_jobs_desc: string;
  nav_settings: string;
  nav_settings_desc: string;
  // Sidebar
  sidebar_eyebrow: string;
  sidebar_desc: string;
  sidebar_collapse: string;
  sidebar_expand: string;
  // Common
  loading: string;
  error_prefix: string;
  save: string;
  cancel: string;
  delete: string;
  edit: string;
  refresh: string;
  refreshing: string;
  unsaved: string;
  all_saved: string;
  revert: string;
  saved_ok: string;
  // Login
  login_hero_eyebrow: string;
  login_hero_h1: string;
  login_hero_desc: string;
  login_card_model: string;
  login_card_team: string;
  login_card_job: string;
  login_signin_eyebrow: string;
  login_h2: string;
  login_demo: string;
  login_email: string;
  login_password: string;
  login_remember: string;
  login_submit: string;
  login_submitting: string;
  login_err_fail: string;
  login_err_exc: string;
  // User menu / card
  user_signedin: string;
  user_profile: string;
  user_ui: string;
  user_signout: string;
  // Dashboard overview
  overview_greeting: string;   // use interpolate({name})
  overview_fetch_error: string;
  overview_unavailable: string;
  overview_ws_donut: string;
  overview_ws_center: string;
  overview_ws_empty: string;
  overview_ds_donut: string;
  overview_ds_center: string;
  overview_ds_legend: string;
  overview_job_donut: string;
  overview_job_center: string;
  overview_anno_donut: string;
  overview_anno_center: string;
  // Job status labels
  job_queued: string;
  job_running: string;
  job_completed: string;
  job_failed: string;
  job_stopped: string;
  // Jobs workspace
  jobs_eyebrow: string;
  jobs_h2: string;
  jobs_with_logs: string;  // use interpolate({count})
  jobs_refresh_aria: string;
  jobs_none: string;
  jobs_load_fail: string;
  jobs_locked: string;
  jobs_unlocked: string;
  jobs_deleted: string;
  jobs_op_fail: string;
  jobs_del_fail: string;
  jobs_del_confirm: string;  // use interpolate({id})
  jobs_detail_id: string;
  jobs_detail_model: string;
  jobs_detail_dataset: string;
  jobs_detail_created: string;
  jobs_detail_progress: string;
  jobs_detail_error: string;
  jobs_no_del_locked: string;
  jobs_no_del_running: string;
  jobs_can_del: string;
  jobs_btn_lock: string;
  jobs_btn_unlock: string;
  jobs_meta_locked: string;
  jobs_meta_log_saved: string;
  // Models workspace
  models_eyebrow: string;
  models_h2: string;
  models_desc: string;
  models_refresh: string;
  models_none: string;
  models_list_eyebrow: string;
  models_list_h3: string;
  models_detail_eyebrow: string;
  models_save: string;
  models_saving: string;
  models_rename_btn: string;
  models_dl_weights: string;
  models_downloading: string;
  models_dl_fail: string;
  models_rename_fail: string;
  models_fetch_fail: string;
  models_weights_fail: string;
  models_detail_workspace: string;
  models_detail_model: string;
  models_detail_created: string;
  models_detail_params: string;
  models_select_hint: string;
  // Datasets workspace
  ds_eyebrow: string;
  ds_h2: string;
  ds_desc: string;
  ds_refresh: string;
  ds_none: string;
  ds_filter: string;
  ds_all: string;
  ds_detail_eyebrow: string;
  ds_locked: string;
  ds_unlocked: string;
  ds_deleted: string;
  ds_del_confirm: string;  // use interpolate({id})
  ds_source_upload: string;
  ds_source_id: string;
  ds_img_class: string;    // use interpolate({count, classes})
  ds_lock_tip: string;
  ds_unlock_tip: string;
  ds_locked_del: string;
  ds_del_tip: string;
  ds_op_fail: string;
  ds_del_fail: string;
  ds_share_need_email: string;
  ds_shared: string;
  ds_unshared: string;
  ds_share_fail: string;
  ds_load_fail: string;
  ds_locked_no_del: string;
  ds_id_label: string;
  ds_uploaded: string;
  ds_count_summary: string;
  ds_img_count: string;
  ds_class_count: string;
  ds_classes_label: string;
  ds_sample_img: string;
  ds_no_sample: string;
  ds_shared_users: string;
  ds_share_add: string;
  ds_share_revoke: string;
  ds_no_shared: string;
  ds_select_hint: string;
  ds_resource_label: string;
  btn_lock: string;
  btn_unlock: string;
  // Image DB workspace
  idb_eyebrow: string;
  idb_h2: string;
  idb_desc: string;
  idb_conn_type: string;
  idb_conn_method: string;
  idb_reg_eyebrow: string;
  idb_registered: string;
  idb_updated: string;
  idb_deleted: string;
  idb_del_confirm: string;
  idb_registered_eyebrow: string;
  idb_registered_h3: string;
  idb_loading: string;
  idb_none: string;
  idb_none_sub: string;
  idb_reg_btn: string;
  idb_registering: string;
  idb_edit: string;
  idb_delete: string;
  idb_deleting: string;
  idb_save: string;
  idb_saving: string;
  idb_cancel: string;
  idb_fetch_fail: string;
  idb_reg_fail: string;
  idb_update_fail: string;
  idb_del_fail: string;
  idb_form_name: string;
  idb_form_name_hint: string;
  idb_form_name_short: string;
  idb_form_folder_path: string;
  idb_form_server: string;
  idb_form_mount_path: string;
  idb_form_endpoint: string;
  idb_form_bucket: string;
  idb_form_path: string;
  idb_method_direct_folder: string;
  idb_method_watch_folder: string;
  idb_method_smb: string;
  idb_method_nfs: string;
  idb_method_s3: string;
  idb_method_blob: string;
  idb_reg_hint: string;
  idb_count: string;
  // Settings workspace
  st_eyebrow: string;
  st_h2: string;
  st_desc: string;
  st_appear_eyebrow: string;
  st_appear_h3: string;
  st_theme_h4: string;
  st_theme_desc: string;
  st_bg_h4: string;
  st_bg_desc: string;
  st_font_h4: string;
  st_font_desc: string;
  st_lang_h4: string;
  st_lang_desc: string;
  // Font size labels
  font_xs: string;
  font_small: string;
  font_medium: string;
  font_large: string;
  font_xl: string;
  // Theme labels
  theme_dark: string;
  theme_light: string;
  theme_midnight: string;
  theme_forest: string;
  theme_rose: string;
  // BG labels
  bg_default: string;
  bg_aurora: string;
  bg_sunset: string;
  bg_ocean: string;
  bg_minimal: string;
  // Language labels
  lang_ja: string;
  lang_en: string;
  // Date locale for toLocaleString
  date_locale: string;
  // Workspaces workspace
  ws_eyebrow: string;
  ws_h2: string;
  ws_desc: string;
  ws_mgr_eyebrow: string;
  ws_mgr_h2: string;
  ws_mgr_desc: string;
  ws_list_eyebrow: string;
  ws_list_h3: string;
  ws_new: string;
  ws_method: string;
  ws_resource_access: string;
  ws_not_set: string;
  ws_not_selected: string;
  ws_not_entered: string;
  ws_open_studio: string;
  ws_empty_title: string;
  ws_empty_desc: string;
  ws_pipeline_eyebrow: string;
  ws_edit_h3: string;
  ws_create_h3: string;
  ws_flow_aria: string;
  ws_current_input: string;
  ws_field_name: string;
  ws_field_target: string;
  ws_field_model: string;
  ws_field_resource_type: string;
  ws_field_target_folder: string;
  ws_back: string;
  ws_next: string;
  ws_update: string;
  ws_create: string;
  ws_select_please: string;
  ws_no_registered_connection: string;
  ws_database_hint: string;
  ws_delete_confirm: string;
  ws_delete_failed: string;
  ws_update_failed: string;
  ws_name_placeholder: string;
  ws_status_completed: string;
  ws_status_running: string;
  ws_status_pending: string;
  ws_step_model_title: string;
  ws_step_model_summary: string;
  ws_step_folder_title: string;
  ws_step_folder_summary: string;
  ws_target_object_detection: string;
  ws_target_object_detection_desc: string;
  ws_target_anomaly_detection: string;
  ws_target_anomaly_detection_desc: string;
  ws_target_segmentation: string;
  ws_target_segmentation_desc: string;
  ws_target_ocr_inspection: string;
  ws_target_ocr_inspection_desc: string;
  ws_target_pose_keypoint: string;
  ws_target_pose_keypoint_desc: string;
  ws_db_local: string;
  ws_db_local_helper: string;
  ws_db_nas: string;
  ws_db_nas_helper: string;
  ws_db_cloud: string;
  ws_db_cloud_helper: string;
  ws_model_fallback_desc: string;
  ws_model_yolo_desc: string;
  ws_model_rtdetr_desc: string;
  ws_model_fasterrcnn_desc: string;
  ws_model_patchcore_desc: string;
  ws_model_fastflow_desc: string;
  ws_model_padim_desc: string;
  ws_model_yoloseg_desc: string;
  ws_model_maskrcnn_desc: string;
  ws_model_sam_desc: string;
  ws_model_paddleocr_desc: string;
  ws_model_crnn_desc: string;
  ws_model_yoloocr_desc: string;
  ws_model_yolopose_desc: string;
  ws_model_hrnet_desc: string;
  ws_model_openpose_desc: string;
}

// ─── Japanese ─────────────────────────────────────────────────────────────────

const ja: TranslationMap = {
  nav_overview: "概要",
  nav_overview_desc: "全体状況と主要指標",
  nav_workspaces: "ワークスペース",
  nav_workspaces_desc: "作成と実行フロー管理",
  nav_image_db: "リソースアクセス",
  nav_image_db_desc: "接続先の設定",
  nav_datasets: "データセット",
  nav_datasets_desc: "学習データと品質確認",
  nav_models: "カスタムモデル",
  nav_models_desc: "モデル一覧と状態確認",
  nav_jobs: "ジョブ",
  nav_jobs_desc: "キューと進捗の確認",
  nav_settings: "設定",
  nav_settings_desc: "全体設定",

  sidebar_eyebrow: "AI スタジオ",
  sidebar_desc: "KENPIN NEXT は、画像AIの構築から学習、運用管理までを一貫して支える統合ワークスペースです。",
  sidebar_collapse: "サイドバーを収納",
  sidebar_expand: "サイドバーを展開",

  loading: "読み込み中...",
  error_prefix: "エラー:",
  save: "保存",
  cancel: "キャンセル",
  delete: "削除",
  edit: "編集",
  refresh: "更新",
  refreshing: "更新中...",
  unsaved: "未保存の変更があります",
  all_saved: "現在の設定は保存済みです",
  revert: "変更を戻す",
  saved_ok: "基本設定を保存しました",

  login_hero_eyebrow: "Kenpin Studio",
  login_hero_h1: "画像系 AI モデル運用を、安全にチームで回すための入口です。",
  login_hero_desc: "モデル登録、学習ジョブ監視、データセット品質チェックを一つの管理基盤で扱えます。現在は NextAuth.js の credentials 認証をつないであり、ログイン後は保護された管理画面へ移動します。",
  login_card_model: "LoRA / fine-tune / 推論向けモデルを整理",
  login_card_team: "認証後だけ設定編集へ入れる構成に変更済み",
  login_card_job: "GPU キュー、進捗、レビュー待ちを継続監視",
  login_signin_eyebrow: "Sign In",
  login_h2: "管理画面にログイン",
  login_demo: "デモ用初期値:",
  login_email: "メール",
  login_password: "パスワード",
  login_remember: "ログイン状態を保持する",
  login_submit: "ログインして続行",
  login_submitting: "ログイン中...",
  login_err_fail: "ログインに失敗しました。入力内容と環境変数を確認してください。",
  login_err_exc: "ログイン処理でエラーが発生しました。もう一度お試しください。",

  user_signedin: "ログイン中",
  user_profile: "プロフィール設定",
  user_ui: "UIデザイン変更",
  user_signout: "ログアウト",

  overview_greeting: "おかえり、{name} さん",
  overview_fetch_error: "データの取得に失敗しました",
  overview_unavailable: "取得できませんでした",
  overview_ws_donut: "ユーザー作成ワークスペース",
  overview_ws_center: "作成数",
  overview_ws_empty: "未作成",
  overview_ds_donut: "データセット件数",
  overview_ds_center: "登録数",
  overview_ds_legend: "登録済み",
  overview_job_donut: "ジョブ集計",
  overview_job_center: "合計",
  overview_anno_donut: "アノテーション進捗",
  overview_anno_center: "完了率",

  job_queued: "待機中",
  job_running: "実行中",
  job_completed: "完了",
  job_failed: "失敗",
  job_stopped: "停止",

  jobs_eyebrow: "ジョブ",
  jobs_h2: "ジョブ履歴",
  jobs_with_logs: "ログを保存済みの完了ジョブ: {count}件",
  jobs_refresh_aria: "ジョブ一覧を更新",
  jobs_none: "ジョブはありません",
  jobs_load_fail: "読み込みに失敗しました",
  jobs_locked: "ジョブをロックしました。",
  jobs_unlocked: "ジョブのロックを解除しました。",
  jobs_deleted: "ジョブを削除しました。",
  jobs_op_fail: "操作に失敗しました。",
  jobs_del_fail: "削除に失敗しました。",
  jobs_del_confirm: "ジョブ {id} を削除しますか？",
  jobs_detail_id: "ジョブID",
  jobs_detail_model: "モデル",
  jobs_detail_dataset: "データセット",
  jobs_detail_created: "作成日時",
  jobs_detail_progress: "進捗",
  jobs_detail_error: "エラー詳細",
  jobs_no_del_locked: "ロック中のため削除できません",
  jobs_no_del_running: "削除前にジョブを停止してください",
  jobs_can_del: "削除可能です",
  jobs_btn_lock: "ロック",
  jobs_btn_unlock: "ロック解除",
  jobs_meta_locked: "ロック中",
  jobs_meta_log_saved: "ログ保存済み",

  models_eyebrow: "Models",
  models_h2: "学習済みモデル",
  models_desc: "作成したモデルの学習結果とパラメータを確認できます。",
  models_refresh: "モデル一覧を更新",
  models_none: "完了済みモデルが見つかりません。学習ジョブを実行してください。",
  models_list_eyebrow: "Registry",
  models_list_h3: "モデル一覧",
  models_detail_eyebrow: "Detail",
  models_save: "保存",
  models_saving: "保存中…",
  models_rename_btn: "名前変更",
  models_dl_weights: "重みをダウンロード",
  models_downloading: "ダウンロード中…",
  models_dl_fail: "重みファイルを取得できませんでした",
  models_rename_fail: "変更に失敗しました",
  models_fetch_fail: "取得に失敗しました",
  models_weights_fail: "重みファイルを取得できませんでした",
  models_detail_workspace: "ワークスペース",
  models_detail_model: "モデル",
  models_detail_created: "作成日時",
  models_detail_params: "パラメーター",
  models_select_hint: "左のリストからモデルを選んでください",

  ds_eyebrow: "データセット",
  ds_h2: "データセット管理",
  ds_desc: "生成されたデータセットの一覧を表示します。",
  ds_refresh: "データセットを更新",
  ds_none: "データセットが見つかりません",
  ds_filter: "ワークスペース絞り込み",
  ds_all: "すべてのワークスペース",
  ds_detail_eyebrow: "データセット詳細",
  ds_locked: "データセットをロックしました。",
  ds_unlocked: "データセットのロックを解除しました。",
  ds_deleted: "データセットを削除しました。",
  ds_del_confirm: "データセット {id} を削除しますか？",
  ds_source_upload: "アップロード済みデータセット",
  ds_source_id: "データセットID:",
  ds_img_class: "画像 {count} 枚 / クラス {classes} 件",
  ds_lock_tip: "ロック",
  ds_unlock_tip: "ロック解除",
  ds_locked_del: "ロック中は削除できません",
  ds_del_tip: "削除",
  ds_op_fail: "操作に失敗しました。",
  ds_del_fail: "削除に失敗しました。",
  ds_share_need_email: "先にメールアドレスを入力してください。",
  ds_shared: "共有ユーザーを追加しました。",
  ds_unshared: "共有を解除しました。",
  ds_share_fail: "共有操作に失敗しました。",
  ds_load_fail: "読み込みに失敗しました",
  ds_locked_no_del: "ロック中は削除できません",
  ds_id_label: "データセットID: {id}",
  ds_uploaded: "アップロード済みデータセット",
  ds_count_summary: "画像 {images} 枚 / クラス {classes} 件",
  ds_img_count: "画像数",
  ds_class_count: "クラス数",
  ds_classes_label: "クラス一覧",
  ds_sample_img: "サンプル画像",
  ds_no_sample: "なし",
  ds_shared_users: "共有ユーザー",
  ds_share_add: "共有追加",
  ds_share_revoke: "共有解除",
  ds_no_shared: "共有ユーザーはいません",
  ds_select_hint: "データセットを選択してください",
  ds_resource_label: "リソース",
  btn_lock: "ロック",
  btn_unlock: "ロック解除",

  idb_eyebrow: "リソースアクセス",
  idb_h2: "接続先を登録",
  idb_desc: "接続タイプと接続方法を選んで接続先を手動で登録できます。登録済みの接続先はワークスペース作成で選択できます。",
  idb_conn_type: "接続タイプ",
  idb_conn_method: "接続方法",
  idb_reg_eyebrow: "接続先登録",
  idb_registered: "接続先を登録しました。ワークスペース作成で選択できます。",
  idb_updated: "接続先を更新しました。",
  idb_deleted: "保存先を削除しました。",
  idb_del_confirm: "この保存先を削除しますか？ワークスペースで使用中の場合は削除できません。",
  idb_registered_eyebrow: "登録済み",
  idb_registered_h3: "ワークスペースで利用可能な接続先",
  idb_loading: "接続先を読み込み中です",
  idb_none: "登録済み接続先はありません",
  idb_none_sub: "上のフォームから接続先を登録してください。",
  idb_reg_btn: "接続先を登録",
  idb_registering: "登録中...",
  idb_edit: "編集",
  idb_delete: "削除",
  idb_deleting: "削除中...",
  idb_save: "保存",
  idb_saving: "保存中...",
  idb_cancel: "キャンセル",
  idb_fetch_fail: "接続情報の取得に失敗しました。",
  idb_reg_fail: "接続先の登録に失敗しました。",
  idb_update_fail: "接続先の更新に失敗しました。",
  idb_del_fail: "接続先の削除に失敗しました。",
  idb_form_name: "名前",
  idb_form_name_hint: "（ワークスペース選択画面に表示されます）",
  idb_form_name_short: "名前",
  idb_form_folder_path: "フォルダパス（フルパス）",
  idb_form_server: "サーバーアドレス",
  idb_form_mount_path: "マウントパス",
  idb_form_endpoint: "エンドポイント",
  idb_form_bucket: "バケット / コンテナ名",
  idb_form_path: "パス",
  idb_method_direct_folder: "ローカルフォルダ直接指定",
  idb_method_watch_folder: "監視フォルダ連携",
  idb_method_smb: "SMB共有",
  idb_method_nfs: "NFSマウント",
  idb_method_s3: "S3バケット",
  idb_method_blob: "Azure Blob",
  idb_reg_hint: "登録後はワークスペース作成画面で選択できます。",
  idb_count: "{count} 件",

  st_eyebrow: "Settings",
  st_h2: "基本設定",
  st_desc: "WEBアプリの見え方や読みやすさを、自分の作業スタイルに合わせて設定できます。",
  st_appear_eyebrow: "Appearance",
  st_appear_h3: "アプリ表示",
  st_theme_h4: "テーマ",
  st_theme_desc: "カラーテーマを選択します。",
  st_bg_h4: "バックグラウンド",
  st_bg_desc: "テーマとは独立して、背景グラデーションを選択します。",
  st_font_h4: "文字サイズ",
  st_font_desc: "画面全体の文字の大きさを調整します。",
  st_lang_h4: "表示言語",
  st_lang_desc: "インターフェースの表示言語を切り替えます。",

  font_xs: "極小",
  font_small: "小",
  font_medium: "標準",
  font_large: "大",
  font_xl: "特大",

  theme_dark: "ダーク",
  theme_light: "ライト",
  theme_midnight: "ミッドナイト",
  theme_forest: "フォレスト",
  theme_rose: "ローズ",

  bg_default: "テーマ準拠",
  bg_aurora: "オーロラ",
  bg_sunset: "サンセット",
  bg_ocean: "オーシャン",
  bg_minimal: "ミニマル",

  lang_ja: "日本語",
  lang_en: "English",

  date_locale: "ja-JP",

  ws_eyebrow: "ワークスペース",
  ws_h2: "ワークスペース一覧",
  ws_desc: "学習パイプラインの作成・管理を行います。",
  ws_mgr_eyebrow: "Workspace Manager",
  ws_mgr_h2: "ワークスペース一覧と作成フロー",
  ws_mgr_desc: "この画面では、ワークスペース一覧管理と、作成に必要な 2 工程だけを順に設定できます。",
  ws_list_eyebrow: "Workspace List",
  ws_list_h3: "ワークスペース一覧",
  ws_new: "新規作成",
  ws_method: "手法",
  ws_resource_access: "リソースアクセス",
  ws_not_set: "未設定",
  ws_not_selected: "未選択",
  ws_not_entered: "未入力",
  ws_open_studio: "スタジオを開く",
  ws_empty_title: "ワークスペースがまだありません",
  ws_empty_desc: "「新規作成」を押すと下部に作成フローが表示されます。",
  ws_pipeline_eyebrow: "Pipeline",
  ws_edit_h3: "ワークスペース編集",
  ws_create_h3: "ワークスペース作成フロー",
  ws_flow_aria: "作成フロー工程",
  ws_current_input: "Current Input",
  ws_field_name: "ワークスペース名",
  ws_field_target: "ターゲット",
  ws_field_model: "モデルタイプ",
  ws_field_resource_type: "リソースタイプ",
  ws_field_target_folder: "対象フォルダ",
  ws_back: "戻る",
  ws_next: "次へ",
  ws_update: "ワークスペースを更新",
  ws_create: "ワークスペースを作成",
  ws_select_please: "選択してください",
  ws_no_registered_connection: "登録済みの接続先がありません",
  ws_database_hint: "画像DB設定ページで登録済みの接続先から、選んだタイプに合うものだけを表示しています。",
  ws_delete_confirm: "このワークスペースを削除しますか？この操作は取り消せません。",
  ws_delete_failed: "ワークスペースの削除に失敗しました。",
  ws_update_failed: "ワークスペースの更新に失敗しました。",
  ws_name_placeholder: "例: Retail YOLO Project",
  ws_status_completed: "完了",
  ws_status_running: "入力中",
  ws_status_pending: "未着手",
  ws_step_model_title: "基本設定",
  ws_step_model_summary: "ワークスペース名、手法、モデル候補を設定します。",
  ws_step_folder_title: "接続設定",
  ws_step_folder_summary: "DBタイプと登録済みマウント対象を選択します。",
  ws_target_object_detection: "物体検出",
  ws_target_object_detection_desc: "部品や製品、欠品対象などの位置と種類を検出します。",
  ws_target_anomaly_detection: "異常検知",
  ws_target_anomaly_detection_desc: "傷、欠け、汚れ、変色などの異常を検出します。",
  ws_target_segmentation: "セグメンテーション",
  ws_target_segmentation_desc: "領域単位で対象を切り分けて形状や面積を扱います。",
  ws_target_ocr_inspection: "OCR・文字検査",
  ws_target_ocr_inspection_desc: "ラベル、印字、賞味期限、シリアルなどの文字検査を行います。",
  ws_target_pose_keypoint: "姿勢推定・キーポイント",
  ws_target_pose_keypoint_desc: "位置関係や向き、組付け姿勢をキーポイントで確認します。",
  ws_db_local: "ローカルタイプ",
  ws_db_local_helper: "ローカルで登録済みの画像DB接続先を選択します。",
  ws_db_nas: "NAS",
  ws_db_nas_helper: "NAS で登録済みの画像DB接続先を選択します。",
  ws_db_cloud: "クラウド",
  ws_db_cloud_helper: "クラウドで登録済みの画像DB接続先を選択します。",
  ws_model_fallback_desc: "ターゲットに合わせた代表的なモデルアーキテクチャを選択します。モデルサイズはパラメーターチューニングで設定できます。",
  ws_model_yolo_desc: "リアルタイム推論向け1ステージ検出器。速度と精度のバランスに優れます。",
  ws_model_rtdetr_desc: "Transformerベースのリアルタイム検出器。高精度かつ高速です。",
  ws_model_fasterrcnn_desc: "2ステージ検出の代表。精度重視の用途に適しています。",
  ws_model_patchcore_desc: "メモリバンクを用いた高精度な異常検知。教師ありラベル不要です。",
  ws_model_fastflow_desc: "正規化フローベースの高速異常検知モデルです。",
  ws_model_padim_desc: "パッチディストリビューションモデリングによる異常検知です。",
  ws_model_yoloseg_desc: "YOLOベースのインスタンスセグメンテーション。高速です。",
  ws_model_maskrcnn_desc: "精度の高いインスタンスセグメンテーションの定番モデルです。",
  ws_model_sam_desc: "Segment Anything Model。汎用性が高いセグメンテーションです。",
  ws_model_paddleocr_desc: "多言語対応のOCRフレームワーク。日本語に強みがあります。",
  ws_model_crnn_desc: "文字認識と検出を組み合わせた構成です。",
  ws_model_yoloocr_desc: "YOLOで文字領域を検出しOCRで認識する2段構成です。",
  ws_model_yolopose_desc: "YOLOベースの高速キーポイント検出です。",
  ws_model_hrnet_desc: "高解像度表現を保持したキーポイント検出の高精度モデルです。",
  ws_model_openpose_desc: "マルチパーソン姿勢推定の定番フレームワークです。",
};

// ─── English ──────────────────────────────────────────────────────────────────

const en: TranslationMap = {
  nav_overview: "Overview",
  nav_overview_desc: "Overall status and key metrics",
  nav_workspaces: "Workspaces",
  nav_workspaces_desc: "Create and manage execution flows",
  nav_image_db: "Resource Access",
  nav_image_db_desc: "Manage connection settings",
  nav_datasets: "Datasets",
  nav_datasets_desc: "Training data and quality checks",
  nav_models: "Custom Models",
  nav_models_desc: "Model list and status",
  nav_jobs: "Jobs",
  nav_jobs_desc: "Queue and progress monitoring",
  nav_settings: "Settings",
  nav_settings_desc: "Application settings",

  sidebar_eyebrow: "AI Studio",
  sidebar_desc: "KENPIN NEXT is an integrated workspace supporting image AI development, training, and operations management.",
  sidebar_collapse: "Collapse sidebar",
  sidebar_expand: "Expand sidebar",

  loading: "Loading...",
  error_prefix: "Error:",
  save: "Save",
  cancel: "Cancel",
  delete: "Delete",
  edit: "Edit",
  refresh: "Refresh",
  refreshing: "Refreshing...",
  unsaved: "You have unsaved changes",
  all_saved: "All settings saved",
  revert: "Revert changes",
  saved_ok: "Settings saved",

  login_hero_eyebrow: "Kenpin Studio",
  login_hero_h1: "The gateway to safe, collaborative image AI model operations.",
  login_hero_desc: "Model registration, training job monitoring, and dataset quality checks — all in one management platform. NextAuth.js credentials auth is enabled; login redirects to the protected admin dashboard.",
  login_card_model: "Organize LoRA / fine-tune / inference models",
  login_card_team: "Only authenticated users can access settings",
  login_card_job: "Monitor GPU queue, progress, and review queue",
  login_signin_eyebrow: "Sign In",
  login_h2: "Sign in to the dashboard",
  login_demo: "Demo credentials:",
  login_email: "Email",
  login_password: "Password",
  login_remember: "Stay signed in",
  login_submit: "Sign in and continue",
  login_submitting: "Signing in...",
  login_err_fail: "Login failed. Please check your credentials and environment variables.",
  login_err_exc: "An error occurred during login. Please try again.",

  user_signedin: "Signed in",
  user_profile: "Profile settings",
  user_ui: "Change UI design",
  user_signout: "Sign out",

  overview_greeting: "Welcome back, {name}",
  overview_fetch_error: "Failed to fetch data",
  overview_unavailable: "Unavailable",
  overview_ws_donut: "Your Workspaces",
  overview_ws_center: "Created",
  overview_ws_empty: "None",
  overview_ds_donut: "Datasets",
  overview_ds_center: "Registered",
  overview_ds_legend: "Registered",
  overview_job_donut: "Job Summary",
  overview_job_center: "Total",
  overview_anno_donut: "Annotation Progress",
  overview_anno_center: "Done",

  job_queued: "Queued",
  job_running: "Running",
  job_completed: "Completed",
  job_failed: "Failed",
  job_stopped: "Stopped",

  jobs_eyebrow: "Jobs",
  jobs_h2: "Job History",
  jobs_with_logs: "Completed jobs with logs: {count}",
  jobs_refresh_aria: "Refresh job list",
  jobs_none: "No jobs found",
  jobs_load_fail: "Failed to load",
  jobs_locked: "Job locked.",
  jobs_unlocked: "Job unlocked.",
  jobs_deleted: "Job deleted.",
  jobs_op_fail: "Operation failed.",
  jobs_del_fail: "Delete failed.",
  jobs_del_confirm: "Delete job {id}?",
  jobs_detail_id: "Job ID",
  jobs_detail_model: "Model",
  jobs_detail_dataset: "Dataset",
  jobs_detail_created: "Created",
  jobs_detail_progress: "Progress",
  jobs_detail_error: "Error details",
  jobs_no_del_locked: "Cannot delete while locked",
  jobs_no_del_running: "Stop the job before deleting",
  jobs_can_del: "Ready to delete",
  jobs_btn_lock: "Lock",
  jobs_btn_unlock: "Unlock",
  jobs_meta_locked: "Locked",
  jobs_meta_log_saved: "Log saved",

  models_eyebrow: "Models",
  models_h2: "Trained Models",
  models_desc: "View training results and parameters for your models.",
  models_refresh: "Refresh model list",
  models_none: "No completed models found. Run a training job first.",
  models_list_eyebrow: "Registry",
  models_list_h3: "Model List",
  models_detail_eyebrow: "Detail",
  models_save: "Save",
  models_saving: "Saving…",
  models_rename_btn: "Rename",
  models_dl_weights: "Download weights",
  models_downloading: "Downloading…",
  models_dl_fail: "Failed to retrieve weights file",
  models_rename_fail: "Rename failed",
  models_fetch_fail: "Failed to fetch",
  models_weights_fail: "Failed to retrieve weights file",
  models_detail_workspace: "Workspace",
  models_detail_model: "Model",
  models_detail_created: "Created",
  models_detail_params: "Parameters",
  models_select_hint: "Select a model from the list",

  ds_eyebrow: "Datasets",
  ds_h2: "Dataset Management",
  ds_desc: "View the list of generated datasets.",
  ds_refresh: "Refresh datasets",
  ds_none: "No datasets found",
  ds_filter: "Filter by workspace",
  ds_all: "All workspaces",
  ds_detail_eyebrow: "Dataset Details",
  ds_locked: "Dataset locked.",
  ds_unlocked: "Dataset unlocked.",
  ds_deleted: "Dataset deleted.",
  ds_del_confirm: "Delete dataset {id}?",
  ds_source_upload: "Uploaded dataset",
  ds_source_id: "Dataset ID:",
  ds_img_class: "{count} images / {classes} classes",
  ds_lock_tip: "Lock",
  ds_unlock_tip: "Unlock",
  ds_locked_del: "Locked — cannot delete",
  ds_del_tip: "Delete",
  ds_op_fail: "Operation failed.",
  ds_del_fail: "Delete failed.",
  ds_share_need_email: "Please enter an email address first.",
  ds_shared: "Share user added.",
  ds_unshared: "Share revoked.",
  ds_share_fail: "Share operation failed.",
  ds_load_fail: "Failed to load",
  ds_locked_no_del: "Cannot delete while locked",
  ds_id_label: "Dataset ID: {id}",
  ds_uploaded: "Uploaded dataset",
  ds_count_summary: "{images} images / {classes} classes",
  ds_img_count: "Images",
  ds_class_count: "Classes",
  ds_classes_label: "Class list",
  ds_sample_img: "Sample image",
  ds_no_sample: "None",
  ds_shared_users: "Shared users",
  ds_share_add: "Add share",
  ds_share_revoke: "Revoke share",
  ds_no_shared: "No shared users",
  ds_select_hint: "Select a dataset",
  ds_resource_label: "Resource",
  btn_lock: "Lock",
  btn_unlock: "Unlock",

  idb_eyebrow: "Resource Access",
  idb_h2: "Register Connection",
  idb_desc: "Select a connection type and method to register a connection. Registered connections can be selected when creating workspaces.",
  idb_conn_type: "Connection type",
  idb_conn_method: "Method",
  idb_reg_eyebrow: "Register Connection",
  idb_registered: "Connection registered. You can select it when creating a workspace.",
  idb_updated: "Connection updated.",
  idb_deleted: "Connection deleted.",
  idb_del_confirm: "Delete this connection? It cannot be deleted if it is in use by a workspace.",
  idb_registered_eyebrow: "Registered",
  idb_registered_h3: "Connections available to workspaces",
  idb_loading: "Loading connections",
  idb_none: "No registered connections",
  idb_none_sub: "Register a connection using the form above.",
  idb_reg_btn: "Register connection",
  idb_registering: "Registering...",
  idb_edit: "Edit",
  idb_delete: "Delete",
  idb_deleting: "Deleting...",
  idb_save: "Save",
  idb_saving: "Saving...",
  idb_cancel: "Cancel",
  idb_fetch_fail: "Failed to fetch connection info.",
  idb_reg_fail: "Failed to register connection.",
  idb_update_fail: "Failed to update connection.",
  idb_del_fail: "Failed to delete connection.",
  idb_form_name: "Name",
  idb_form_name_hint: "(displayed in the workspace selector)",
  idb_form_name_short: "Name",
  idb_form_folder_path: "Folder path (full path)",
  idb_form_server: "Server address",
  idb_form_mount_path: "Mount path",
  idb_form_endpoint: "Endpoint",
  idb_form_bucket: "Bucket / Container name",
  idb_form_path: "Path",
  idb_method_direct_folder: "Direct local folder",
  idb_method_watch_folder: "Watch folder",
  idb_method_smb: "SMB share",
  idb_method_nfs: "NFS mount",
  idb_method_s3: "S3 bucket",
  idb_method_blob: "Azure Blob",
  idb_reg_hint: "After registration, it can be selected when creating a workspace.",
  idb_count: "{count} items",

  st_eyebrow: "Settings",
  st_h2: "Settings",
  st_desc: "Customize the app's appearance and readability to match your work style.",
  st_appear_eyebrow: "Appearance",
  st_appear_h3: "App Display",
  st_theme_h4: "Theme",
  st_theme_desc: "Select a color theme.",
  st_bg_h4: "Background",
  st_bg_desc: "Choose a background gradient independently of the theme.",
  st_font_h4: "Font Size",
  st_font_desc: "Adjust the text size across the entire app.",
  st_lang_h4: "Display Language",
  st_lang_desc: "Switch the interface language.",

  font_xs: "XS",
  font_small: "Small",
  font_medium: "Medium",
  font_large: "Large",
  font_xl: "XL",

  theme_dark: "Dark",
  theme_light: "Light",
  theme_midnight: "Midnight",
  theme_forest: "Forest",
  theme_rose: "Rose",

  bg_default: "Theme default",
  bg_aurora: "Aurora",
  bg_sunset: "Sunset",
  bg_ocean: "Ocean",
  bg_minimal: "Minimal",

  lang_ja: "日本語",
  lang_en: "English",

  date_locale: "en-US",

  ws_eyebrow: "Workspaces",
  ws_h2: "Workspace List",
  ws_desc: "Create and manage training pipelines.",
  ws_mgr_eyebrow: "Workspace Manager",
  ws_mgr_h2: "Workspace List and Creation Flow",
  ws_mgr_desc: "On this screen, you can manage workspace lists and configure only the two required creation steps in order.",
  ws_list_eyebrow: "Workspace List",
  ws_list_h3: "Workspace List",
  ws_new: "New Workspace",
  ws_method: "Method",
  ws_resource_access: "Resource Access",
  ws_not_set: "Not set",
  ws_not_selected: "Not selected",
  ws_not_entered: "Not entered",
  ws_open_studio: "Open Studio",
  ws_empty_title: "No workspaces yet",
  ws_empty_desc: "Click \"New Workspace\" to show the creation flow below.",
  ws_pipeline_eyebrow: "Pipeline",
  ws_edit_h3: "Edit Workspace",
  ws_create_h3: "Workspace Creation Flow",
  ws_flow_aria: "Creation flow steps",
  ws_current_input: "Current Input",
  ws_field_name: "Workspace Name",
  ws_field_target: "Target",
  ws_field_model: "Model Type",
  ws_field_resource_type: "Resource Type",
  ws_field_target_folder: "Target Folder",
  ws_back: "Back",
  ws_next: "Next",
  ws_update: "Update Workspace",
  ws_create: "Create Workspace",
  ws_select_please: "Please select",
  ws_no_registered_connection: "No registered connection",
  ws_database_hint: "Only connections matching the selected type are shown from registered entries on the Image DB settings page.",
  ws_delete_confirm: "Delete this workspace? This action cannot be undone.",
  ws_delete_failed: "Failed to delete workspace.",
  ws_update_failed: "Failed to update workspace.",
  ws_name_placeholder: "e.g. Retail YOLO Project",
  ws_status_completed: "Completed",
  ws_status_running: "In progress",
  ws_status_pending: "Pending",
  ws_step_model_title: "Basic Settings",
  ws_step_model_summary: "Set workspace name, method, and candidate model.",
  ws_step_folder_title: "Connection Settings",
  ws_step_folder_summary: "Select DB type and registered mount target.",
  ws_target_object_detection: "Object Detection",
  ws_target_object_detection_desc: "Detect positions and categories of parts, products, and missing items.",
  ws_target_anomaly_detection: "Anomaly Detection",
  ws_target_anomaly_detection_desc: "Detect anomalies such as scratches, chips, stains, and discoloration.",
  ws_target_segmentation: "Segmentation",
  ws_target_segmentation_desc: "Segment targets by region to handle shape and area.",
  ws_target_ocr_inspection: "OCR/Text Inspection",
  ws_target_ocr_inspection_desc: "Inspect text such as labels, prints, expiration dates, and serials.",
  ws_target_pose_keypoint: "Pose/Keypoint",
  ws_target_pose_keypoint_desc: "Verify positional relationships, orientation, and assembly posture with keypoints.",
  ws_db_local: "Local",
  ws_db_local_helper: "Select a locally registered image DB connection.",
  ws_db_nas: "NAS",
  ws_db_nas_helper: "Select a NAS-registered image DB connection.",
  ws_db_cloud: "Cloud",
  ws_db_cloud_helper: "Select a cloud-registered image DB connection.",
  ws_model_fallback_desc: "Choose a representative model architecture for the selected target. Model size can be adjusted during parameter tuning.",
  ws_model_yolo_desc: "A one-stage detector for real-time inference with strong speed/accuracy balance.",
  ws_model_rtdetr_desc: "Transformer-based real-time detector with high accuracy and speed.",
  ws_model_fasterrcnn_desc: "A classic two-stage detector suitable for accuracy-focused use cases.",
  ws_model_patchcore_desc: "High-accuracy anomaly detection using a memory bank; no supervised labels required.",
  ws_model_fastflow_desc: "A fast anomaly detection model based on normalizing flows.",
  ws_model_padim_desc: "Anomaly detection via patch distribution modeling.",
  ws_model_yoloseg_desc: "YOLO-based instance segmentation with high speed.",
  ws_model_maskrcnn_desc: "A standard high-accuracy model for instance segmentation.",
  ws_model_sam_desc: "Segment Anything Model with broad segmentation versatility.",
  ws_model_paddleocr_desc: "A multilingual OCR framework with strong Japanese support.",
  ws_model_crnn_desc: "A combined pipeline of text recognition and detection.",
  ws_model_yoloocr_desc: "Two-stage setup: YOLO detects text regions and OCR recognizes text.",
  ws_model_yolopose_desc: "Fast keypoint detection based on YOLO.",
  ws_model_hrnet_desc: "High-accuracy keypoint model preserving high-resolution representations.",
  ws_model_openpose_desc: "A standard framework for multi-person pose estimation.",
};

// ─── Translations registry ────────────────────────────────────────────────────

const translations: Record<Locale, TranslationMap> = { ja, en };

// ─── Interpolation helper ─────────────────────────────────────────────────────

/**
 * Replaces {key} placeholders in a template string.
 * @example interpolate("Hello {name}", { name: "Alice" }) → "Hello Alice"
 */
export function interpolate(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(params[key] ?? `{${key}}`),
  );
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface LanguageCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

export const LanguageContext = createContext<LanguageCtx>({
  locale: "ja",
  setLocale: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ja");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { locale?: string };
        if (p.locale === "en") setLocaleState("en");
      }
    } catch {
      // ignore
    }
  }, []);

  const setLocale = (l: Locale) => setLocaleState(l);

  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Returns the current locale and a setter. */
export function useLanguage(): LanguageCtx {
  return useContext(LanguageContext);
}

/** Returns the translation map for the current locale. */
export function useT(): TranslationMap {
  const { locale } = useLanguage();
  return translations[locale];
}
