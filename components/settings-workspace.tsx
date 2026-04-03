/**
 * 設定ページ
 * 
 * 機能:
 * - ワークスペース全体の基本設定を管理
 * - デフォルト設定（モデル、解像度、最大同時ジョブ数）
 * - ストレージポリシー、セキュリティメモを編集
 */
"use client";

import { workspaceSettings } from "@/lib/dashboard-data";

export function SettingsWorkspace() {
  return (
    <div className="workspace-content">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>ワークスペース全体の基本設定</h2>
          <p className="muted">
            認証後の管理画面全体に影響する既定値やレビュー方針をここで管理します。
          </p>
        </div>
      </section>

      <section className="detail-grid single-column">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ワークスペース既定値</p>
              <h3>既定値の編集</h3>
            </div>
          </div>

          <form className="editor-form">
            <label>
              デフォルトベースモデル
              <input defaultValue={workspaceSettings.defaultBaseModel} />
            </label>
            <label>
              デフォルト解像度
              <input defaultValue={workspaceSettings.defaultResolution} />
            </label>
            <label>
              最大同時ジョブ数
              <input defaultValue={workspaceSettings.maxConcurrentJobs} />
            </label>
            <label>
              自動レビュー
              <input defaultValue={workspaceSettings.autoReview ? "有効" : "無効"} />
            </label>
            <label className="full-span">
              ストレージポリシー
              <textarea defaultValue={workspaceSettings.storagePolicy} rows={5} />
            </label>
            <label className="full-span">
              セキュリティメモ
              <textarea
                defaultValue="認証ログインは現在デモ管理者アカウントを使用しています。本番環境では実ユーザーストアとハッシュ化されたパスワードに置き換えてください。"
                rows={5}
              />
            </label>
            <div className="form-actions full-span">
              <button type="button">ワークスペース設定を保存</button>
            </div>
          </form>
        </article>
      </section>
    </div>
  );
}
