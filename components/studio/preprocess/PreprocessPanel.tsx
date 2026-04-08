"use client";

import type { PreprocessConfig } from "../../../lib/preprocess/applyPreprocess";

export type PreprocessPanelProps = {
  cfg: PreprocessConfig;
  onConfigChange: <K extends keyof PreprocessConfig>(key: K, value: PreprocessConfig[K]) => void;
  saving: boolean;
  saved: boolean;
  saveError: string;
  onSave: () => void;
};

/** 前処理設定コントロール群（ステートレス） */
export default function PreprocessPanel({
  cfg,
  onConfigChange,
  saving,
  saved,
  saveError,
  onSave,
}: PreprocessPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      {/* リサイズ */}
      <div className="studio-checkboxes">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={cfg.resizeEnabled}
            onChange={(e) => onConfigChange("resizeEnabled", e.target.checked)}
          />
          リサイズ
        </label>
        {cfg.resizeEnabled && (
          <label className="db-control" style={{ marginTop: "0.4rem" }}>
            サイズ (px)
            <select
              value={cfg.resize}
              onChange={(e) => onConfigChange("resize", Number(e.target.value))}
            >
              {[320, 416, 512, 640, 768, 1024].map((v) => (
                <option key={v} value={v}>
                  {v} × {v}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* 切り抜き */}
      <div className="studio-checkboxes">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={cfg.crop}
            onChange={(e) => onConfigChange("crop", e.target.checked)}
          />
          切り抜き
        </label>
        {cfg.crop && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.4rem",
              marginTop: "0.4rem",
            }}
          >
            {(["cropX", "cropY", "cropW", "cropH"] as const).map((k) => (
              <label key={k} className="db-control" style={{ fontSize: "0.76rem" }}>
                {k === "cropX"
                  ? "X開始 (%)"
                  : k === "cropY"
                  ? "Y開始 (%)"
                  : k === "cropW"
                  ? "幅 (%)"
                  : "高さ (%)"}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={cfg[k]}
                  onChange={(e) => onConfigChange(k, Number(e.target.value))}
                  style={{ fontSize: "0.76rem" }}
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* カラー処理 */}
      <p style={{ fontSize: "0.74rem", opacity: 0.55, margin: "0.2rem 0 -0.2rem" }}>
        カラー処理
      </p>
      <div className="studio-checkboxes">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={cfg.grayscale}
            onChange={(e) => {
              onConfigChange("grayscale", e.target.checked);
              if (e.target.checked) {
                onConfigChange("binarize", false);
                onConfigChange("histogramEqualization", false);
              }
            }}
          />
          グレースケール
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={cfg.binarize}
            onChange={(e) => {
              onConfigChange("binarize", e.target.checked);
              if (e.target.checked) {
                onConfigChange("grayscale", false);
                onConfigChange("histogramEqualization", false);
              }
            }}
          />
          二値化
        </label>
        {cfg.binarize && (
          <label
            className="db-control"
            style={{ fontSize: "0.76rem", marginTop: "0.2rem" }}
          >
            閾値: {cfg.binarizeThreshold}
            <input
              type="range"
              min={0}
              max={255}
              value={cfg.binarizeThreshold}
              onChange={(e) => onConfigChange("binarizeThreshold", Number(e.target.value))}
            />
          </label>
        )}
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={cfg.histogramEqualization}
            onChange={(e) => {
              onConfigChange("histogramEqualization", e.target.checked);
              if (e.target.checked) {
                onConfigChange("grayscale", false);
                onConfigChange("binarize", false);
              }
            }}
          />
          ヒストグラム平坦化
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={cfg.edgeEnhance}
            onChange={(e) => onConfigChange("edgeEnhance", e.target.checked)}
          />
          エッジ強調
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={cfg.normalize}
            onChange={(e) => onConfigChange("normalize", e.target.checked)}
          />
          正規化 (0–1)
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={cfg.removeBlur}
            onChange={(e) => onConfigChange("removeBlur", e.target.checked)}
          />
          ブレ画像を除外
        </label>
      </div>

      {/* 色調調整 */}
      <p style={{ fontSize: "0.74rem", opacity: 0.55, margin: "0.2rem 0 -0.2rem" }}>
        色調調整
      </p>
      {(
        [
          { key: "hue" as const, label: "色相", min: -180, max: 180 },
          { key: "saturation" as const, label: "彩度", min: -100, max: 100 },
          { key: "brightness" as const, label: "明度", min: -100, max: 100 },
        ] as const
      ).map(({ key, label, min, max }) => (
        <label
          key={key}
          className="db-control"
          style={{ display: "grid", gap: "0.15rem" }}
        >
          <span style={{ fontSize: "0.76rem" }}>
            {label}: {cfg[key] > 0 ? "+" : ""}
            {cfg[key]}
          </span>
          <input
            type="range"
            min={min}
            max={max}
            value={cfg[key]}
            onChange={(e) => onConfigChange(key, Number(e.target.value))}
          />
        </label>
      ))}

      {/* オーグメンテーション */}
      <p style={{ fontSize: "0.74rem", opacity: 0.55, margin: "0.2rem 0 -0.2rem" }}>
        オーグメンテーション
      </p>
      <div className="studio-checkboxes">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={cfg.augFlip}
            onChange={(e) => onConfigChange("augFlip", e.target.checked)}
          />
          水平フリップ
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={cfg.augRotate}
            onChange={(e) => onConfigChange("augRotate", e.target.checked)}
          />
          ランダム回転 (±15°)
        </label>
      </div>

      {/* 保存 */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", paddingTop: "0.4rem" }}>
        <button type="button" onClick={onSave} disabled={saving}>
          {saving ? "保存中..." : "⚙️ 設定を保存"}
        </button>
        {saved && (
          <span style={{ color: "#7cf0ba", fontSize: "0.8rem" }}>✓ 設定を保存しました</span>
        )}
        {saveError && (
          <span style={{ color: "#f87171", fontSize: "0.8rem" }}>{saveError}</span>
        )}
      </div>
    </div>
  );
}
