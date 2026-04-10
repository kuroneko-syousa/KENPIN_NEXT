/**
 * 設定ページ
 *
 * GET /settings  でサーバーから現在の設定を読み込み、
 * PUT /settings  で変更を保存します。
 */
"use client";

import { useState, useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface AppSettings {
  default_model: string;
  default_epochs: number;
  default_imgsz: number;
  default_batch: number;
  max_concurrent_jobs: number;
  device_mode: string;
  storage_note: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  default_model: "yolov8n",
  default_epochs: 50,
  default_imgsz: 640,
  default_batch: 16,
  max_concurrent_jobs: 4,
  device_mode: "auto",
  storage_note: "",
};

export function SettingsWorkspace() {
  const [form, setForm] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    fetch(`${API_BASE}/settings`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<AppSettings>;
      })
      .then((data) => setForm(data))
      .catch((e) => setFetchError(e instanceof Error ? e.message : "設定の取得に失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="workspace-content">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>ワークスペース全体の基本設定</h2>
          <p className="muted">
            学習ジョブのデフォルト設定やシステム動作ポリシーを管理します。
          </p>
        </div>
      </section>

      {fetchError && (
        <div className="panel" style={{ color: "#f06060", padding: "1rem" }}>
          エラー: {fetchError}
        </div>
      )}

      <section className="detail-grid single-column">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">デフォルト設定</p>
              <h3>学習パラメータの既定値</h3>
            </div>
          </div>

          {loading ? (
            <p className="muted" style={{ padding: "1rem" }}>読み込み中…</p>
          ) : (
            <form
              className="editor-form"
              onSubmit={(e) => { e.preventDefault(); save(); }}
            >
              <label>
                デフォルトモデル
                <input
                  value={form.default_model}
                  onChange={(e) => set("default_model", e.target.value)}
                  placeholder="yolov8n"
                />
              </label>
              <label>
                デフォルトエポック数
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={form.default_epochs}
                  onChange={(e) => set("default_epochs", Number(e.target.value))}
                />
              </label>
              <label>
                デフォルト画像サイズ (px)
                <input
                  type="number"
                  min={32}
                  max={1280}
                  value={form.default_imgsz}
                  onChange={(e) => set("default_imgsz", Number(e.target.value))}
                />
              </label>
              <label>
                デフォルトバッチサイズ
                <input
                  type="number"
                  min={1}
                  max={256}
                  value={form.default_batch}
                  onChange={(e) => set("default_batch", Number(e.target.value))}
                />
              </label>
              <label>
                最大同時ジョブ数
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={form.max_concurrent_jobs}
                  onChange={(e) => set("max_concurrent_jobs", Number(e.target.value))}
                />
              </label>
              <label>
                デバイスモード
                <select
                  value={form.device_mode}
                  onChange={(e) => set("device_mode", e.target.value)}
                >
                  <option value="auto">auto（自動検出）</option>
                  <option value="cpu">cpu</option>
                  <option value="cuda">cuda</option>
                </select>
              </label>
              <label className="full-span">
                ストレージ / 保持ポリシーメモ
                <textarea
                  rows={4}
                  value={form.storage_note}
                  onChange={(e) => set("storage_note", e.target.value)}
                  placeholder="例: 学習成果物は承認後 30 日間保持"
                />
              </label>

              {saveError && (
                <p className="full-span" style={{ color: "#f06060", margin: 0 }}>
                  保存エラー: {saveError}
                </p>
              )}
              {saved && (
                <p className="full-span" style={{ color: "#7cf0ba", margin: 0 }}>
                  設定を保存しました
                </p>
              )}

              <div className="form-actions full-span">
                <button type="submit" disabled={saving}>
                  {saving ? "保存中…" : "設定を保存"}
                </button>
              </div>
            </form>
          )}
        </article>
      </section>
    </div>
  );
}
