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
              <p className="eyebrow">Workspace Defaults</p>
              <h3>既定値の編集</h3>
            </div>
          </div>

          <form className="editor-form">
            <label>
              Default Base Model
              <input defaultValue={workspaceSettings.defaultBaseModel} />
            </label>
            <label>
              Default Resolution
              <input defaultValue={workspaceSettings.defaultResolution} />
            </label>
            <label>
              Max Concurrent Jobs
              <input defaultValue={workspaceSettings.maxConcurrentJobs} />
            </label>
            <label>
              Auto Review
              <input defaultValue={workspaceSettings.autoReview ? "Enabled" : "Disabled"} />
            </label>
            <label className="full-span">
              Storage Policy
              <textarea defaultValue={workspaceSettings.storagePolicy} rows={5} />
            </label>
            <label className="full-span">
              Security Notes
              <textarea
                defaultValue="Credentials login is currently using a demo admin account. Replace with a real user store and hashed passwords before production."
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
