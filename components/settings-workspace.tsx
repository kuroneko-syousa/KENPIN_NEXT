"use client";

import { useEffect, useMemo, useState } from "react";
import { type Locale, useLanguage, useT } from "@/lib/i18n";

type ThemeMode = "dark" | "light" | "midnight" | "forest" | "rose";
type FontSizeMode = "xs" | "small" | "medium" | "large" | "xl";
type BgStyle = "default" | "aurora" | "sunset" | "ocean" | "minimal";

const VALID_THEMES: ThemeMode[] = ["dark", "light", "midnight", "forest", "rose"];
const VALID_FONT_SIZES: FontSizeMode[] = ["xs", "small", "medium", "large", "xl"];
const VALID_BG_STYLES: BgStyle[] = ["default", "aurora", "sunset", "ocean", "minimal"];
const VALID_LOCALES: Locale[] = ["ja", "en"];
const LIGHT_THEMES: ThemeMode[] = ["light", "rose"];

type FontSizeMeta = {
  value: FontSizeMode;
  label: string;
  px: number;
};

const FONT_SIZES: FontSizeMeta[] = [
  { value: "xs",     label: "極小", px: 12 },
  { value: "small",  label: "小",   px: 14 },
  { value: "medium", label: "標準", px: 16 },
  { value: "large",  label: "大",   px: 18 },
  { value: "xl",     label: "特大", px: 20 },
];

type ThemeMeta = {
  value: ThemeMode;
  label: string;
  bg: string;
  dots: [string, string, string];
};

type BgMeta = {
  value: BgStyle;
  label: string;
  darkBg: string;
  lightBg: string;
};

const BG_STYLES: BgMeta[] = [
  {
    value: "default",
    label: "テーマ準拠",
    darkBg: "",  // preview computed from current theme
    lightBg: "",
  },
  {
    value: "aurora",
    label: "オーロラ",
    darkBg: "radial-gradient(circle at 30% 30%, rgba(0,220,130,0.65), transparent 55%), radial-gradient(circle at 70% 30%, rgba(40,130,255,0.55), transparent 55%), linear-gradient(135deg, #080f16, #0f1c2a)",
    lightBg: "radial-gradient(circle at 30% 30%, rgba(0,200,120,0.45), transparent 55%), radial-gradient(circle at 70% 30%, rgba(40,100,255,0.38), transparent 55%), linear-gradient(135deg, #f0f6ff, #e8f4f0)",
  },
  {
    value: "sunset",
    label: "サンセット",
    darkBg: "radial-gradient(circle at 30% 30%, rgba(255,120,50,0.75), transparent 55%), radial-gradient(circle at 70% 30%, rgba(200,50,180,0.6), transparent 55%), linear-gradient(135deg, #130808, #201018)",
    lightBg: "radial-gradient(circle at 30% 30%, rgba(255,140,60,0.5), transparent 55%), radial-gradient(circle at 70% 30%, rgba(210,80,180,0.42), transparent 55%), linear-gradient(135deg, #fff5f0, #fce8f5)",
  },
  {
    value: "ocean",
    label: "オーシャン",
    darkBg: "radial-gradient(circle at 30% 30%, rgba(30,200,220,0.65), transparent 55%), radial-gradient(circle at 70% 30%, rgba(20,80,200,0.58), transparent 55%), linear-gradient(135deg, #050d18, #0a1e30)",
    lightBg: "radial-gradient(circle at 30% 30%, rgba(30,180,220,0.48), transparent 55%), radial-gradient(circle at 70% 30%, rgba(20,80,200,0.38), transparent 55%), linear-gradient(135deg, #f0f8ff, #e5f4fb)",
  },
  {
    value: "minimal",
    label: "ミニマル",
    darkBg: "linear-gradient(135deg, #0f1218, #1a1f28)",
    lightBg: "linear-gradient(135deg, #f5f7fb, #edf0f6)",
  },
];

const THEMES: ThemeMeta[] = [
  {
    value: "dark",
    label: "ダーク",
    bg: "linear-gradient(135deg, #10131d 0%, #182033 46%, #24324d 100%)",
    dots: ["#528fff", "#ffc16a", "#4ae4b0"],
  },
  {
    value: "light",
    label: "ライト",
    bg: "linear-gradient(135deg, #f4f7fc 0%, #e9eef8 46%, #dfe8f8 100%)",
    dots: ["#578bff", "#ffaa3b", "#30c98a"],
  },
  {
    value: "midnight",
    label: "ミッドナイト",
    bg: "linear-gradient(135deg, #0c0818 0%, #130f2a 46%, #1c1442 100%)",
    dots: ["#a05fff", "#e070ff", "#5090ff"],
  },
  {
    value: "forest",
    label: "フォレスト",
    bg: "linear-gradient(135deg, #050e09 0%, #0a1f12 46%, #102a1a 100%)",
    dots: ["#3cc86e", "#80e8a0", "#2baa8a"],
  },
  {
    value: "rose",
    label: "ローズ",
    bg: "linear-gradient(135deg, #fef0f4 0%, #f9e5ec 46%, #f4dbe5 100%)",
    dots: ["#e05a7d", "#ff8aaa", "#c0408a"],
  },
];

type UiSettings = {
  theme: ThemeMode;
  fontSize: FontSizeMode;
  bg: BgStyle;
  locale: Locale;
};

const STORAGE_KEY = "kenpin-ui-settings";

const DEFAULT_SETTINGS: UiSettings = {
  theme: "dark",
  fontSize: "medium",
  bg: "default",
  locale: "ja",
};

function applyUiSettings(settings: UiSettings) {
  if (typeof document === "undefined") return;
  document.body.dataset.theme = settings.theme;
  document.documentElement.dataset.fontSize = settings.fontSize;
  if (settings.bg === "default") {
    delete document.body.dataset.bg;
  } else {
    document.body.dataset.bg = settings.bg;
  }
}

function loadUiSettings(): UiSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    const theme = (VALID_THEMES as string[]).includes(parsed.theme ?? "")
      ? (parsed.theme as ThemeMode)
      : "dark";
    const fontSize = (VALID_FONT_SIZES as string[]).includes(parsed.fontSize ?? "")
      ? (parsed.fontSize as FontSizeMode)
      : "medium";
    const bg = (VALID_BG_STYLES as string[]).includes((parsed as { bg?: string }).bg ?? "")
      ? ((parsed as { bg?: string }).bg as BgStyle)
      : "default";
    const locale: Locale = (VALID_LOCALES as string[]).includes((parsed as { locale?: string }).locale ?? "")
      ? ((parsed as { locale?: string }).locale as Locale)
      : "ja";
    return { theme, fontSize, bg, locale };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveUiSettings(settings: UiSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function SettingsWorkspace() {
  const { setLocale } = useLanguage();
  const t = useT();
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
    setLocale(form.locale);
    setBaseline(form);
    setSaved(true);
  };

  const reset = () => {
    setSaved(false);
    setForm(baseline);
    applyUiSettings(baseline);
    setLocale(baseline.locale);
  };

  return (
    <div className="workspace-content">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">{t.st_eyebrow}</p>
          <h2>{t.st_h2}</h2>
          <p className="muted">{t.st_desc}</p>
        </div>
      </section>

      <section className="detail-grid single-column">
        <article className="panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">{t.st_appear_eyebrow}</p>
              <h3>{t.st_appear_h3}</h3>
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
              <h4>{t.st_theme_h4}</h4>
              <p className="muted">{t.st_theme_desc}</p>
            </div>
            <div className="full-span theme-grid">
              {THEMES.map((th) => {
                const themeLabel = t[`theme_${th.value}` as keyof typeof t] as string;
                return (
                  <button
                    key={th.value}
                    type="button"
                    className={`theme-card${form.theme === th.value ? " active" : ""}`}
                    onClick={() => update("theme", th.value)}
                    title={themeLabel}
                  >
                    <div
                      className="theme-card-preview"
                      style={{ background: th.bg }}
                    >
                      {th.dots.map((color, i) => (
                        <span
                          key={i}
                          className="theme-card-dot"
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                    <span className="theme-card-label">{themeLabel}</span>
                  </button>
                );
              })}
            </div>

            <div className="full-span settings-subsection">
              <h4>{t.st_bg_h4}</h4>
              <p className="muted">{t.st_bg_desc}</p>
            </div>
            <div className="full-span theme-grid">
              {BG_STYLES.map((b) => {
                const isLight = LIGHT_THEMES.includes(form.theme);
                const bgLabel = t[`bg_${b.value}` as keyof typeof t] as string;
                const preview =
                  b.value === "default"
                    ? (THEMES.find((th) => th.value === form.theme)?.bg ?? "")
                    : isLight
                    ? b.lightBg
                    : b.darkBg;
                return (
                  <button
                    key={b.value}
                    type="button"
                    className={`theme-card${form.bg === b.value ? " active" : ""}`}
                    onClick={() => update("bg", b.value)}
                    title={bgLabel}
                  >
                    <div className="theme-card-preview" style={{ background: preview }} />
                    <span className="theme-card-label">{bgLabel}</span>
                  </button>
                );
              })}
            </div>

            <div className="full-span settings-subsection">
              <h4>{t.st_font_h4}</h4>
              <p className="muted">{t.st_font_desc}</p>
            </div>
            <div className="full-span font-size-group">
              {FONT_SIZES.map((s) => {
                const fsLabel = t[`font_${s.value}` as keyof typeof t] as string;
                return (
                  <button
                    key={s.value}
                    type="button"
                    className={`font-size-btn${form.fontSize === s.value ? " active" : ""}`}
                    onClick={() => update("fontSize", s.value)}
                    title={`${fsLabel} (${s.px}px)`}
                  >
                    <span
                      className="font-size-btn-letter"
                      style={{ fontSize: `${s.px}px` }}
                    >
                      A
                    </span>
                    <span className="font-size-btn-label">{fsLabel}</span>
                  </button>
                );
              })}
            </div>

            <div className="full-span settings-subsection">
              <h4>{t.st_lang_h4}</h4>
              <p className="muted">{t.st_lang_desc}</p>
            </div>
            <div className="full-span font-size-group">
              {VALID_LOCALES.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  className={`font-size-btn${form.locale === loc ? " active" : ""}`}
                  style={{ width: "auto", height: "auto", padding: "0.6rem 1.2rem", fontSize: "0.9rem" }}
                  onClick={() => update("locale", loc)}
                >
                  {loc === "ja" ? t.lang_ja : t.lang_en}
                </button>
              ))}
            </div>

            <p className="full-span muted settings-dirty-indicator" role="status">
              {dirty ? t.unsaved : t.all_saved}
            </p>

            {saved && (
              <p className="full-span" style={{ color: "#7cf0ba", margin: 0 }}>
                {t.saved_ok}
              </p>
            )}

            <div className="form-actions full-span">
              <button type="button" className="ghost-button" onClick={reset} disabled={!dirty}>
                {t.revert}
              </button>
              <button type="submit" disabled={!dirty}>
                {t.save}
              </button>
            </div>
          </form>
        </article>
      </section>
    </div>
  );
}
