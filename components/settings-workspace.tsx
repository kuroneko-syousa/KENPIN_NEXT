"use client";

import { useEffect, useMemo, useState } from "react";

type ThemeMode = "dark" | "light";
type FontSizeMode = "small" | "medium" | "large";

type UiSettings = {
  theme: ThemeMode;
  fontSize: FontSizeMode;
};

const STORAGE_KEY = "kenpin-ui-settings";

const DEFAULT_SETTINGS: UiSettings = {
  theme: "dark",
  fontSize: "medium",
};

function applyUiSettings(settings: UiSettings) {
  if (typeof document === "undefined") return;
  document.body.dataset.theme = settings.theme;
  document.documentElement.dataset.fontSize = settings.fontSize;
}

function loadUiSettings(): UiSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    const theme = parsed.theme === "light" ? "light" : "dark";
    const fontSize =
      parsed.fontSize === "small" || parsed.fontSize === "large"
        ? parsed.fontSize
        : "medium";
    return { theme, fontSize };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveUiSettings(settings: UiSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function SettingsWorkspace() {
  const [form, setForm] = useState<UiSettings>(DEFAULT_SETTINGS);
  const [baseline, setBaseline] = useState<UiSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const loaded = loadUiSettings();
    setForm(loaded);
    setBaseline(loaded);
    applyUiSettings(loaded);
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baseline),
    [form, baseline]
  );

  const update = <K extends keyof UiSettings>(key: K, value: UiSettings[K]) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    saveUiSettings(form);
    applyUiSettings(form);
    setBaseline(form);
    setSaved(true);
  };

  const reset = () => {
    setSaved(false);
    setForm(baseline);
    applyUiSettings(baseline);
  };

  return (
    <div className="workspace-content">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>基本設定</h2>
          <p className="muted">
            WEBアプリの見え方や読みやすさを、自分の作業スタイルに合わせて設定できます。
          </p>
        </div>
      </section>

      <section className="detail-grid single-column">
        <article className="panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Appearance</p>
              <h3>アプリ表示</h3>
            </div>
          </div>

          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <div className="full-span settings-subsection">
              <h4>テーマ</h4>
              <p className="muted">明るさを選択します。</p>
            </div>
            <label>
              テーマモード
              <select
                value={form.theme}
                onChange={(e) => update("theme", e.target.value as ThemeMode)}
              >
                <option value="dark">ダークモード</option>
                <option value="light">ライトモード</option>
              </select>
            </label>

            <div className="full-span settings-subsection">
              <h4>文字サイズ</h4>
              <p className="muted">画面全体の文字の大きさを調整します。</p>
            </div>
            <label>
              フォントサイズ
              <select
                value={form.fontSize}
                onChange={(e) => update("fontSize", e.target.value as FontSizeMode)}
              >
                <option value="small">小</option>
                <option value="medium">標準</option>
                <option value="large">大</option>
              </select>
            </label>

            <p className="full-span muted settings-dirty-indicator" role="status">
              {dirty ? "未保存の変更があります" : "現在の設定は保存済みです"}
            </p>

            {saved && (
              <p className="full-span" style={{ color: "#7cf0ba", margin: 0 }}>
                基本設定を保存しました
              </p>
            )}

            <div className="form-actions full-span">
              <button type="button" className="ghost-button" onClick={reset} disabled={!dirty}>
                変更を戻す
              </button>
              <button type="submit" disabled={!dirty}>
                保存
              </button>
            </div>
          </form>
        </article>
      </section>
    </div>
  );
}
