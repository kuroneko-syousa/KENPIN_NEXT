"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { AnnotateImage, DrawTool } from "../types/annotate";
export type { AnnotateImage, AnyRegion, DrawTool } from "../types/annotate";

/* react-konva は SSR 非対応のため動的インポート */
type KonvaAnnotatorProps = {
  images: AnnotateImage[];
  currentIndex?: number;
  regionClsList: string[];
  defaultTool?: DrawTool;
  onClassListChange?: (next: string[]) => void;
  onSave: (updated: AnnotateImage[]) => void;
  onClose: () => void;
};
const KonvaAnnotator = dynamic<KonvaAnnotatorProps>(
  () => import("./konva-annotator").then((m) => ({ default: m.default })),
  {
    ssr: false,
    loading: () => <p className="muted" style={{ padding: "2rem" }}>アノテーターを読み込み中...</p>,
  }
);

type StudioTab = "preprocess" | "annotation" | "params" | "training" | "results";

type WorkspaceInfo = {
  id: string;
  name: string;
  target: string;
  selectedModel: string;
  imageFolder: string;
  datasetFolder: string;
  databaseId: string;
  databaseType: string;
  annotationExportPath: string;
  annotationData: string;
  preprocessConfig: string;
  ownerName: string;
  ownerEmail: string;
};

const targetLabels: Record<string, string> = {
  "object-detection": "物体検出",
  "anomaly-detection": "異常検知",
  segmentation: "セグメンテーション",
  "ocr-inspection": "OCR・文字検査",
  "pose-keypoint": "姿勢推定・キーポイント",
};

const tabs: { id: StudioTab; label: string; icon: string }[] = [
  { id: "preprocess", label: "前処理", icon: "⚙️" },
  { id: "annotation", label: "アノテーション", icon: "🏷️" },
  { id: "params", label: "パラメーター", icon: "🎛️" },
  { id: "training", label: "学習", icon: "🚀" },
  { id: "results", label: "結果確認", icon: "📊" },
];

/* ─── 前処理設定型 ─── */
export type PreprocessConfig = {
  resize: number;
  grayscale: boolean;
  binarize: boolean;
  binarizeThreshold: number;
  histogramEqualization: boolean;
  edgeEnhance: boolean;
  normalize: boolean;
  removeBlur: boolean;
  crop: boolean;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  hue: number;
  saturation: number;
  brightness: number;
  augFlip: boolean;
  augRotate: boolean;
};

const DEFAULT_CONFIG: PreprocessConfig = {
  resize: 640,
  grayscale: false,
  binarize: false,
  binarizeThreshold: 128,
  histogramEqualization: false,
  edgeEnhance: false,
  normalize: false,
  removeBlur: false,
  crop: false,
  cropX: 0,
  cropY: 0,
  cropW: 100,
  cropH: 100,
  hue: 0,
  saturation: 0,
  brightness: 0,
  augFlip: false,
  augRotate: false,
};

type PreprocessResult = { dataUrl: string; srcW: number; srcH: number; outSize: number };

/** Canvas API を使ったピクセル処理 */
function applyPreprocess(src: string, cfg: PreprocessConfig): Promise<PreprocessResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const srcW = img.width;
      const srcH = img.height;
      // リサイズ
      const targetSize = cfg.resize;
      let sw = img.width;
      let sh = img.height;
      let sx = 0;
      let sy = 0;

      // 切り抜き（%指定 → px換算）
      if (cfg.crop) {
        sx = Math.round((cfg.cropX / 100) * img.width);
        sy = Math.round((cfg.cropY / 100) * img.height);
        sw = Math.round((cfg.cropW / 100) * img.width);
        sh = Math.round((cfg.cropH / 100) * img.height);
        sw = Math.max(1, Math.min(sw, img.width - sx));
        sh = Math.max(1, Math.min(sh, img.height - sy));
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetSize, targetSize);

      const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
      const d = imageData.data;

      // グレースケール
      if (cfg.grayscale || cfg.binarize || cfg.histogramEqualization) {
        for (let i = 0; i < d.length; i += 4) {
          const gray = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
          d[i] = gray;
          d[i + 1] = gray;
          d[i + 2] = gray;
        }
      }

      // 二値化
      if (cfg.binarize) {
        const thr = cfg.binarizeThreshold;
        for (let i = 0; i < d.length; i += 4) {
          const v = d[i] >= thr ? 255 : 0;
          d[i] = v;
          d[i + 1] = v;
          d[i + 2] = v;
        }
      }

      // ヒストグラム平坦化
      if (cfg.histogramEqualization && !cfg.binarize) {
        const hist = new Array<number>(256).fill(0);
        for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
        const total = targetSize * targetSize;
        const cdf = new Array<number>(256).fill(0);
        cdf[0] = hist[0];
        for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + hist[i];
        const cdfMin = cdf.find((v) => v > 0) ?? 0;
        const lut = cdf.map((v) => Math.round(((v - cdfMin) / (total - cdfMin)) * 255));
        for (let i = 0; i < d.length; i += 4) {
          d[i] = lut[d[i]];
          d[i + 1] = lut[d[i + 1]];
          d[i + 2] = lut[d[i + 2]];
        }
      }

      // エッジ強調（ラプラシアン畳み込み）
      if (cfg.edgeEnhance) {
        const w = targetSize;
        const h = targetSize;
        const src2 = new Uint8ClampedArray(d);
        const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            for (let c = 0; c < 3; c++) {
              let val = 0;
              for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                  val += src2[((y + ky) * w + (x + kx)) * 4 + c] * kernel[(ky + 1) * 3 + (kx + 1)];
                }
              }
              d[(y * w + x) * 4 + c] = Math.max(0, Math.min(255, val));
            }
          }
        }
      }

      // 色調調整（brightness / saturation / hue）
      if (cfg.brightness !== 0 || cfg.saturation !== 0 || cfg.hue !== 0) {
        const bAdj = cfg.brightness / 100;
        const sAdj = cfg.saturation / 100;
        const hAdj = cfg.hue;
        for (let i = 0; i < d.length; i += 4) {
          let r = d[i] / 255;
          let g = d[i + 1] / 255;
          let b = d[i + 2] / 255;
          // RGB → HSL
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          let h2 = 0;
          let s2 = 0;
          let l2 = (max + min) / 2;
          if (max !== min) {
            const delta = max - min;
            s2 = l2 > 0.5 ? delta / (2 - max - min) : delta / (max + min);
            h2 = max === r ? (g - b) / delta + (g < b ? 6 : 0)
               : max === g ? (b - r) / delta + 2
               : (r - g) / delta + 4;
            h2 /= 6;
          }
          h2 = (h2 + hAdj / 360 + 1) % 1;
          s2 = Math.max(0, Math.min(1, s2 + sAdj));
          l2 = Math.max(0, Math.min(1, l2 + bAdj));
          // HSL → RGB
          if (s2 === 0) {
            r = g = b = l2;
          } else {
            const q = l2 < 0.5 ? l2 * (1 + s2) : l2 + s2 - l2 * s2;
            const p2 = 2 * l2 - q;
            const hue2rgb = (p: number, q2: number, t: number) => {
              const t2 = ((t % 1) + 1) % 1;
              if (t2 < 1 / 6) return p + (q2 - p) * 6 * t2;
              if (t2 < 1 / 2) return q2;
              if (t2 < 2 / 3) return p + (q2 - p) * (2 / 3 - t2) * 6;
              return p;
            };
            r = hue2rgb(p2, q, h2 + 1 / 3);
            g = hue2rgb(p2, q, h2);
            b = hue2rgb(p2, q, h2 - 1 / 3);
          }
          d[i] = Math.round(r * 255);
          d[i + 1] = Math.round(g * 255);
          d[i + 2] = Math.round(b * 255);
        }
      }

      // 正規化（対比較のため明度微調整）
      if (cfg.normalize) {
        for (let i = 0; i < d.length; i += 4) {
          d[i] = Math.min(255, Math.round(d[i] * 1.04));
          d[i + 1] = Math.min(255, Math.round(d[i + 1] * 1.04));
          d[i + 2] = Math.min(255, Math.round(d[i + 2] * 1.04));
        }
      }

      ctx.putImageData(imageData, 0, 0);

      // 水平フリップ
      if (cfg.augFlip) {
        const flipped = document.createElement("canvas");
        flipped.width = targetSize;
        flipped.height = targetSize;
        const fc = flipped.getContext("2d")!;
        fc.translate(targetSize, 0);
        fc.scale(-1, 1);
        fc.drawImage(canvas, 0, 0);
        resolve({ dataUrl: flipped.toDataURL("image/jpeg", 0.92), srcW, srcH, outSize: targetSize });
        return;
      }

      // ランダム回転（±15°をプレビューでは +10° 固定表示）
      if (cfg.augRotate) {
        const rot = document.createElement("canvas");
        rot.width = targetSize;
        rot.height = targetSize;
        const rc = rot.getContext("2d")!;
        rc.translate(targetSize / 2, targetSize / 2);
        rc.rotate((10 * Math.PI) / 180);
        rc.drawImage(canvas, -targetSize / 2, -targetSize / 2);
        resolve({ dataUrl: rot.toDataURL("image/jpeg", 0.92), srcW, srcH, outSize: targetSize });
        return;
      }

      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.92), srcW, srcH, outSize: targetSize });
    };
    img.src = src;
  });
}

/* ─── 前処理タブ ─── */
function PreprocessTab({ workspace }: { workspace: WorkspaceInfo }) {
  const [cfg, setCfg] = useState<PreprocessConfig>(() => {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(workspace.preprocessConfig || "{}") };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  });

  const [previewImages, setPreviewImages] = useState<Array<{ name: string; src: string }>>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewSourceLabel, setPreviewSourceLabel] = useState(workspace.imageFolder || "未選択");
  const [afterResult, setAfterResult] = useState<PreprocessResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  const selectedPreview = previewImages[previewIndex] ?? null;

  // Afterプレビューを再生成
  useEffect(() => {
    if (!selectedPreview) { setAfterResult(null); return; }
    let cancelled = false;
    applyPreprocess(selectedPreview.src, cfg).then((result) => {
      if (!cancelled) setAfterResult(result);
    });
    return () => { cancelled = true; };
  }, [selectedPreview, cfg]);

  const afterSrc = afterResult?.dataUrl ?? null;

  const set = <K extends keyof PreprocessConfig>(key: K, value: PreprocessConfig[K]) =>
    setCfg((prev) => ({ ...prev, [key]: value }));

  const handleImport = async () => {
    setImportLoading(true);
    setImportError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/images`);
      const json = await res.json();
      if (!res.ok) { setImportError(json.error ?? "読み込みに失敗しました"); return; }
      const loaded = json.images as Array<{ name: string; src: string }>;
      setPreviewImages(loaded);
      setPreviewIndex(0);
      setPreviewSourceLabel(`${workspace.imageFolder} (${loaded.length} 枚)`);
    } catch {
      setImportError("サーバーへの接続に失敗しました");
    } finally {
      setImportLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preprocessConfig: JSON.stringify(cfg) }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError("設定の保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  /* 設定パネル（タブ内・全画面共通） */
  const settingsPanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      {/* リサイズ */}
      <label className="db-control">
        リサイズ (px)
        <select value={cfg.resize} onChange={(e) => set("resize", Number(e.target.value))}>
          {[320, 416, 512, 640, 768, 1024].map((v) => (
            <option key={v} value={v}>{v} × {v}</option>
          ))}
        </select>
      </label>

      {/* 切り抜き */}
      <div className="studio-checkboxes">
        <label className="checkbox-row">
          <input type="checkbox" checked={cfg.crop} onChange={(e) => set("crop", e.target.checked)} />
          切り抜き
        </label>
        {cfg.crop && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginTop: "0.4rem" }}>
            {(["cropX","cropY","cropW","cropH"] as const).map((k) => (
              <label key={k} className="db-control" style={{ fontSize: "0.76rem" }}>
                {k === "cropX" ? "X開始 (%)" : k === "cropY" ? "Y開始 (%)" : k === "cropW" ? "幅 (%)" : "高さ (%)"}
                <input type="number" min={0} max={100} value={cfg[k]}
                  onChange={(e) => set(k, Number(e.target.value))} style={{ fontSize: "0.76rem" }} />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* カラー処理 */}
      <p style={{ fontSize: "0.74rem", opacity: 0.55, margin: "0.2rem 0 -0.2rem" }}>カラー処理</p>
      <div className="studio-checkboxes">
        <label className="checkbox-row">
          <input type="checkbox" checked={cfg.grayscale} onChange={(e) => {
            set("grayscale", e.target.checked);
            if (e.target.checked) { set("binarize", false); set("histogramEqualization", false); }
          }} />
          グレースケール
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={cfg.binarize} onChange={(e) => {
            set("binarize", e.target.checked);
            if (e.target.checked) { set("grayscale", false); set("histogramEqualization", false); }
          }} />
          二値化
        </label>
        {cfg.binarize && (
          <label className="db-control" style={{ fontSize: "0.76rem", marginTop: "0.2rem" }}>
            閾値: {cfg.binarizeThreshold}
            <input type="range" min={0} max={255} value={cfg.binarizeThreshold}
              onChange={(e) => set("binarizeThreshold", Number(e.target.value))} />
          </label>
        )}
        <label className="checkbox-row">
          <input type="checkbox" checked={cfg.histogramEqualization} onChange={(e) => {
            set("histogramEqualization", e.target.checked);
            if (e.target.checked) { set("grayscale", false); set("binarize", false); }
          }} />
          ヒストグラム平坦化
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={cfg.edgeEnhance} onChange={(e) => set("edgeEnhance", e.target.checked)} />
          エッジ強調
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={cfg.normalize} onChange={(e) => set("normalize", e.target.checked)} />
          正規化 (0–1)
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={cfg.removeBlur} onChange={(e) => set("removeBlur", e.target.checked)} />
          ブレ画像を除外
        </label>
      </div>

      {/* 色調調整 */}
      <p style={{ fontSize: "0.74rem", opacity: 0.55, margin: "0.2rem 0 -0.2rem" }}>色調調整</p>
      {([
        { key: "hue" as const, label: "色相", min: -180, max: 180 },
        { key: "saturation" as const, label: "彩度", min: -100, max: 100 },
        { key: "brightness" as const, label: "明度", min: -100, max: 100 },
      ]).map(({ key, label, min, max }) => (
        <label key={key} className="db-control" style={{ display: "grid", gap: "0.15rem" }}>
          <span style={{ fontSize: "0.76rem" }}>{label}: {cfg[key] > 0 ? "+" : ""}{cfg[key]}</span>
          <input type="range" min={min} max={max} value={cfg[key]}
            onChange={(e) => set(key, Number(e.target.value))} />
        </label>
      ))}

      {/* オーグメンテーション */}
      <p style={{ fontSize: "0.74rem", opacity: 0.55, margin: "0.2rem 0 -0.2rem" }}>オーグメンテーション</p>
      <div className="studio-checkboxes">
        <label className="checkbox-row">
          <input type="checkbox" checked={cfg.augFlip} onChange={(e) => set("augFlip", e.target.checked)} />
          水平フリップ
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={cfg.augRotate} onChange={(e) => set("augRotate", e.target.checked)} />
          ランダム回転 (±15°)
        </label>
      </div>

      {/* 保存 */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", paddingTop: "0.4rem" }}>
        <button type="button" onClick={saveConfig} disabled={saving}>
          {saving ? "保存中..." : "⚙️ 設定を保存"}
        </button>
        {saved && <span style={{ color: "#7cf0ba", fontSize: "0.8rem" }}>✓ 設定を保存しました</span>}
        {saveError && <span style={{ color: "#f87171", fontSize: "0.8rem" }}>{saveError}</span>}
      </div>
    </div>
  );

  /* 全画面プレビューポータル */
  const fullscreenPortal = createPortal(
    <AnimatePresence>
      {fullscreenOpen && (
        <motion.div
          className="annotator-fullscreen"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          style={{ display: "flex", flexDirection: "column" }}
        >
          {/* ヘッダー */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0.6rem 1rem", borderBottom: "1px solid rgba(237,241,250,0.1)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>⚙️ 前処理プレビュー</span>
              {previewImages.length > 0 && (
                <span className="muted" style={{ fontSize: "0.78rem" }}>
                  {previewIndex + 1} / {previewImages.length} 枚
                </span>
              )}
            </div>
            <button type="button" className="ghost-button"
              style={{ fontSize: "0.8rem", padding: "0.25rem 0.6rem" }}
              onClick={() => setFullscreenOpen(false)}>
              ✕ 閉じる
            </button>
          </div>

          {/* 本体 */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* 左: 設定パネル */}
            <div style={{ width: "260px", flexShrink: 0, overflowY: "auto", padding: "1rem",
              borderRight: "1px solid rgba(237,241,250,0.1)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>前処理設定</p>
              {settingsPanel}
            </div>

            {/* 右: プレビューエリア */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* サムネイル行 */}
              {previewImages.length > 0 && (
                <div style={{ display: "flex", gap: "0.3rem", padding: "0.5rem 0.8rem",
                  overflowX: "auto", flexShrink: 0, borderBottom: "1px solid rgba(237,241,250,0.08)" }}>
                  {previewImages.map((img, idx) => (
                    <button key={img.name} type="button" onClick={() => setPreviewIndex(idx)} title={img.name}
                      style={{ padding: 0, flexShrink: 0, width: "52px", height: "52px", borderRadius: "6px",
                        overflow: "hidden", cursor: "pointer",
                        border: idx === previewIndex ? "2px solid rgba(124,240,186,0.8)" : "1px solid rgba(237,241,250,0.16)",
                        background: "rgba(9,14,26,0.45)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.src} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </button>
                  ))}
                </div>
              )}

              {/* Before / After 大画像 */}
              <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr",
                gap: "0.8rem", padding: "0.8rem", overflow: "hidden" }}>
                <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.4rem", flexShrink: 0 }}>
                    <p className="eyebrow" style={{ margin: 0 }}>Before（元画像）</p>
                    {afterResult && (
                      <span style={{ fontSize: "0.72rem", opacity: 0.55 }}>
                        {afterResult.srcW} × {afterResult.srcH} px
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, borderRadius: "10px", overflow: "hidden",
                    border: "1px solid rgba(237,241,250,0.12)", background: "rgba(9,14,26,0.4)" }}>
                    {selectedPreview
                      ? /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={selectedPreview.src} alt="before"
                          style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center",
                          justifyContent: "center", opacity: 0.35, fontSize: "0.85rem" }}>
                          画像を読み込んでください
                        </div>
                    }
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.4rem", flexShrink: 0 }}>
                    <p className="eyebrow" style={{ margin: 0 }}>After（前処理後）</p>
                    {afterResult && (
                      <span style={{ fontSize: "0.72rem", color: "rgba(124,240,186,0.8)" }}>
                        {afterResult.outSize} × {afterResult.outSize} px
                        {afterResult.srcW !== afterResult.outSize || afterResult.srcH !== afterResult.outSize
                          ? ` ← ${afterResult.srcW}×${afterResult.srcH}` : ""}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, borderRadius: "10px", overflow: "hidden",
                    border: "1px solid rgba(124,240,186,0.28)", background: "rgba(9,14,26,0.4)" }}>
                    {!selectedPreview
                      ? <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center",
                          justifyContent: "center", opacity: 0.35, fontSize: "0.85rem" }}>
                          画像を読み込んでください
                        </div>
                      : afterSrc
                        ? /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={afterSrc} alt="after"
                            style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center",
                            justifyContent: "center", opacity: 0.4, fontSize: "0.8rem" }}>処理中...</div>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );

  return (
    <>
      {fullscreenPortal}
      <div className="studio-tab-content">
        <div className="studio-section-header">
          <div>
            <p className="eyebrow">Step 1</p>
            <h3>画像前処理</h3>
          </div>
          <span className="status draft">設定はアノテーション時に自動適用されます</span>
        </div>

        <div className="studio-info-row">
          <div className="summary-item">
            <span>入力フォルダ</span>
            <strong>{previewSourceLabel || "未設定"}</strong>
          </div>
        </div>

        {/* 画像インポート & プレビュー起動 */}
        <div className="panel annotation-upload-panel" style={{ marginBottom: "1rem" }}>
          <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>前処理プレビュー</p>
          <p className="muted" style={{ margin: "0 0 0.6rem", fontSize: "0.82rem" }}>
            画像を読み込んでプレビューを開くと、元画像を見ながら設定を調整できます。元画像は変更されません。
          </p>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
            {workspace.imageFolder && (
              <button type="button" className="ghost-button"
                style={{ fontSize: "0.8rem", padding: "0.3rem 0.75rem" }}
                onClick={handleImport} disabled={importLoading}>
                {importLoading ? "読み込み中..." : "📂 設定フォルダから読み込み"}
              </button>
            )}
            {previewImages.length > 0 && (
              <button type="button"
                style={{ fontSize: "0.8rem", padding: "0.3rem 0.75rem" }}
                onClick={() => setFullscreenOpen(true)}>
                🖼️ プレビューを開く（{previewImages.length} 枚）
              </button>
            )}
          </div>
          {importError && <p style={{ color: "#f87171", fontSize: "0.78rem", marginTop: "0.5rem" }}>{importError}</p>}

          {/* サムネイル + 小プレビュー */}
          {previewImages.length > 0 && (
            <div style={{ marginTop: "0.9rem", display: "flex", gap: "0.8rem", flexWrap: "wrap", alignItems: "flex-start" }}>
              {/* サムネイル列 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))",
                gap: "0.3rem", flex: "1 1 200px" }}>
                {previewImages.slice(0, 12).map((img, idx) => (
                  <button key={img.name} type="button" onClick={() => setPreviewIndex(idx)} title={img.name}
                    style={{ padding: 0, borderRadius: "6px", overflow: "hidden", aspectRatio: "1", cursor: "pointer",
                      border: idx === previewIndex ? "1px solid rgba(124,240,186,0.75)" : "1px solid rgba(237,241,250,0.16)",
                      background: "rgba(9,14,26,0.45)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.src} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>

              {/* 選択画像の小プレビュー（Before/After） */}
              {selectedPreview && (
                <div style={{ display: "flex", gap: "0.5rem", flex: "0 0 auto" }}>
                  <div style={{ width: "120px" }}>
                    <p style={{ fontSize: "0.7rem", opacity: 0.55, marginBottom: "0.2rem" }}>Before</p>
                    {afterResult && (
                      <p style={{ fontSize: "0.66rem", opacity: 0.45, marginBottom: "0.2rem" }}>
                        {afterResult.srcW}×{afterResult.srcH}
                      </p>
                    )}
                    <div style={{ borderRadius: "6px", overflow: "hidden", aspectRatio: "1",
                      border: "1px solid rgba(237,241,250,0.12)", background: "rgba(9,14,26,0.4)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selectedPreview.src} alt="before"
                        style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </div>
                  </div>
                  <div style={{ width: "120px" }}>
                    <p style={{ fontSize: "0.7rem", opacity: 0.55, marginBottom: "0.2rem" }}>After</p>
                    {afterResult && (
                      <p style={{ fontSize: "0.66rem", color: "rgba(124,240,186,0.75)", marginBottom: "0.2rem" }}>
                        {afterResult.outSize}×{afterResult.outSize}
                      </p>
                    )}
                    <div style={{ borderRadius: "6px", overflow: "hidden", aspectRatio: "1",
                      border: "1px solid rgba(124,240,186,0.28)", background: "rgba(9,14,26,0.4)" }}>
                      {afterSrc
                        ? /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={afterSrc} alt="after"
                            style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center",
                            justifyContent: "center", opacity: 0.4, fontSize: "0.7rem" }}>...</div>
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 前処理設定（コンパクト） */}
        <div className="panel" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
          <p className="eyebrow" style={{ marginBottom: "1rem" }}>前処理設定</p>
          {settingsPanel}
        </div>
      </div>
    </>
  );
}

/* ─── アノテーションタブ ─── */
// BoxRegion / PolyRegion / PointRegion / AnyRegion / AnnotateImage / DrawTool は types/annotate.ts に移動

const defaultClasses: Record<string, string[]> = {
  "object-detection":  ["object"],
  "anomaly-detection": ["defect", "ok"],
  segmentation:        ["region"],
  "ocr-inspection":    ["text"],
  "pose-keypoint":     ["person"],
};

const toolMap: Record<string, DrawTool> = {
  "object-detection":  "box",
  "anomaly-detection": "box",
  segmentation:        "polygon",
  "ocr-inspection":    "box",
  "pose-keypoint":     "point",
};

function AnnotationTab({ workspace }: { workspace: WorkspaceInfo }) {
  const [images, setImages] = useState<AnnotateImage[]>([]);
  const [annotatorOpen, setAnnotatorOpen] = useState(false);
  const [regionClsList, setRegionClsList] = useState<string[]>(
    defaultClasses[workspace.target] ?? ["object"]
  );
  const [exportPath, setExportPath] = useState(
    workspace.annotationExportPath || workspace.datasetFolder || ""
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [restoreInfo, setRestoreInfo] = useState<string | null>(null);
  const [importSourceLabel, setImportSourceLabel] = useState<string>(workspace.imageFolder || "未選択");

  /* DBから保存済みアノテーションを復元 */
  useEffect(() => {
    try {
      const saved: AnnotateImage[] = JSON.parse(workspace.annotationData || "[]");
      if (saved.length === 0) return;

      // src が空の場合は画像なし（メタデータのみ）の状態で復元
      setImages(saved);
      const withSrc  = saved.filter((img) => img.src).length;
      const total    = saved.length;
      const annotated = saved.filter((img) => img.regions.length > 0).length;
      if (withSrc === total) {
        setRestoreInfo(`前回のセッション (${total} 枚・${annotated} 枚アノテーション済み) を復元しました`);
      } else {
        setRestoreInfo(`アノテーションデータを復元しました（${annotated}枚）。画像を再アップロードしてください`);
      }
      setTimeout(() => setRestoreInfo(null), 5000);
    } catch {
      // 不正なJSONは無視
    }
  // workspace.annotationData は初回マウント時のみ参照
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const annotatedCount = useMemo(
    () => images.filter((img) => img.regions.length > 0).length,
    [images]
  );
  const importPreviewImages = useMemo(
    () => images.filter((img) => Boolean(img.src)).slice(0, 15),
    [images]
  );

  /* アノテーター保存 → state 更新 + DB 永続化 */
  const handleAnnotationSave = async (updated: AnnotateImage[]) => {
    setImages(updated);
    setAnnotatorOpen(false);

    // src はブラウザ上の base64 データURL であり DB に保存しない。
    // regions・name のみ永続化し、復元時は画像の再アップロードを促す。
    const persisted = updated.map((img) => {
      const next = { ...img };
      delete next.src;
      return next;
    });

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotationData: JSON.stringify(persisted) }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.status.toString());
        console.error("[AnnotationTab] annotationData の保存に失敗しました", text);
      }
    } catch (err) {
      console.error("[AnnotationTab] annotationData の保存に失敗しました", err);
    }
  };

  const isImageFile = (file: File) => {
    if (file.type.startsWith("image/")) return true;
    return /\.(png|jpe?g|webp|bmp|gif|tiff?|avif)$/i.test(file.name);
  };

  const getImportName = (file: File) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return rel && rel.trim() ? rel : file.name;
  };

  const importFiles = (files: File[], sourceLabel: string) => {
    const imgFiles = files.filter(isImageFile);
    if (imgFiles.length === 0) return;

    // 前処理設定を読み込む
    let preprocessCfg: PreprocessConfig | null = null;
    try {
      const parsed = JSON.parse(workspace.preprocessConfig || "{}");
      if (Object.keys(parsed).length > 0) {
        preprocessCfg = { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch { /* ignore */ }

    const sorted = [...imgFiles].sort((a, b) => getImportName(a).localeCompare(getImportName(b)));
    const readers = sorted.map(
      (file) =>
        new Promise<AnnotateImage>((resolve) => {
          const name = getImportName(file);
          const reader = new FileReader();
          reader.onload = async () => {
            const rawSrc = reader.result as string;
            // 前処理設定があればCanvas APIで処理を適用
            const src = preprocessCfg ? await applyPreprocess(rawSrc, preprocessCfg) : rawSrc;
            const existing = images.find((img) => img.name === name);
            resolve({ src, name, regions: existing?.regions ?? [] });
          };
          reader.readAsDataURL(file);
        })
    );

    Promise.all(readers).then((imgs) => {
      setImages(imgs);
      setAnnotatorOpen(false);
      setImportSourceLabel(sourceLabel);
    });
  };

  /* 画像フォルダ選択 → DataURL に変換 */
  const handleFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const firstRel = (files[0] as File & { webkitRelativePath?: string } | undefined)?.webkitRelativePath;
    const root = firstRel?.split("/")[0] || "選択フォルダ";
    importFiles(files, `${root} (${files.length} ファイル)`);
    e.target.value = "";
  };

  /* YOLO フォーマット (.txt) をダウンロード */
  const exportYOLO = () => {
    const labelFileName = (name: string) => {
      const base = name.split(/[\\/]/).pop() ?? name;
      return base.replace(/\.[^.]+$/, ".txt");
    };

    images.forEach((img) => {
      const regions = img.regions;
      const lines = regions
        .map((r) => {
          const clsIdx = regionClsList.indexOf(r.cls ?? "");
          if (clsIdx < 0) return null;
          if (r.type === "box") {
            const xc = (r.x + r.w / 2).toFixed(6);
            const yc = (r.y + r.h / 2).toFixed(6);
            return `${clsIdx} ${xc} ${yc} ${r.w.toFixed(6)} ${r.h.toFixed(6)}`;
          }
          if (r.type === "polygon") {
            const pts = r.points.map(([px, py]) => `${px.toFixed(6)} ${py.toFixed(6)}`).join(" ");
            return `${clsIdx} ${pts}`;
          }
          if (r.type === "point") {
            return `${clsIdx} ${r.x.toFixed(6)} ${r.y.toFixed(6)}`;
          }
          return null;
        })
        .filter(Boolean)
        .join("\n");

      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([lines], { type: "text/plain" }));
      a.download = labelFileName(img.name);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    });

    /* classes.txt */
    const ca = document.createElement("a");
    ca.href = URL.createObjectURL(new Blob([regionClsList.join("\n")], { type: "text/plain" }));
    ca.download = "classes.txt";
    document.body.appendChild(ca);
    ca.click();
    document.body.removeChild(ca);
    URL.revokeObjectURL(ca.href);
  };

  /* エクスポートパスを DB に保存 */
  const saveExportPath = async (path: string) => {
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotationExportPath: path }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError("登録に失敗しました。再度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  // ワークスペースで決めた出力先をアノテーション出力先として自動利用する
  useEffect(() => {
    const preferredPath = workspace.annotationExportPath || workspace.datasetFolder || "";
    if (!preferredPath) return;

    setExportPath(preferredPath);

    if (workspace.annotationExportPath === preferredPath) return;
    void saveExportPath(preferredPath);
  // ワークスペース切り替え時に再同期する
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id, workspace.annotationExportPath, workspace.datasetFolder]);

  /* ─── アノテーター全画面表示 (Portal経由で body 直下に描画) ─── */
  const annotatorPortal = createPortal(
    <AnimatePresence>
      {annotatorOpen && images.length > 0 && (
        <motion.div
          className="annotator-fullscreen"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <KonvaAnnotator
            images={images}
            currentIndex={0}
            regionClsList={regionClsList}
            defaultTool={toolMap[workspace.target] ?? "box"}
            onClassListChange={setRegionClsList}
            onSave={handleAnnotationSave}
            onClose={() => setAnnotatorOpen(false)}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );

  /* ─── 通常ビュー ─── */
  return (
    <>
      {annotatorPortal}
      <div style={{ display: "flex", gap: "1rem", position: "relative" }}>
        {/* メインコンテンツ */}
        <div className="studio-tab-content" style={{ flex: 1 }}>
      <div className="studio-section-header">
        <div>
          <p className="eyebrow">Step 2</p>
          <h3>アノテーション</h3>
        </div>
        {annotatedCount > 0 && (
          <span className="status ready">{annotatedCount} 枚アノテーション済み</span>
        )}
      </div>

      {/* 復元バナー */}
      {restoreInfo && (
        <div className="annotation-restore-banner">
          ✅ {restoreInfo}
        </div>
      )}

      {/* 画像読み込み */}
      <div className="panel annotation-upload-panel">
        <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>画像を読み込む</p>
        <div className="annotation-upload-zone">
          <p className="muted" style={{ margin: "0 0 0.75rem" }}>
            ワークスペースで選択したリソースから、画像を一括インポートします。
          </p>
          <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.78rem" }}>
            現在のソース: {importSourceLabel}
          </p>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <label className="annotation-upload-label">
              <input
                type="file"
                multiple
                accept="image/*"
                style={{ display: "none" }}
                // @ts-expect-error - webkitdirectory は非標準属性
                webkitdirectory=""
                onChange={handleFolderUpload}
              />
              🗂 リソースからインポート
            </label>
          </div>

          {importPreviewImages.length > 0 && (
            <div style={{ marginTop: "0.9rem" }}>
              <p className="muted" style={{ margin: "0 0 0.45rem", fontSize: "0.72rem" }}>
                サンプル画像 ({importPreviewImages.length}/{images.length})
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(54px, 1fr))",
                  gap: "0.35rem",
                }}
              >
                {importPreviewImages.map((img) => (
                  <div
                    key={img.name}
                    style={{
                      position: "relative",
                      aspectRatio: "1",
                      borderRadius: "6px",
                      overflow: "hidden",
                      border: "1px solid rgba(237, 241, 250, 0.16)",
                      backgroundColor: "rgba(9, 14, 26, 0.45)",
                    }}
                    title={img.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.src}
                      alt={img.name}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* アノテーター起動 */}
      {images.length > 0 && (
        <div className="workflow-actions" style={{ marginTop: "0.5rem" }}>
          <button
            type="button"
            className="ls-open-btn"
            onClick={() => setAnnotatorOpen(true)}
          >
            <span className="ls-open-icon">🏷️</span>
            アノテーターを開く（{images.length} 枚）
          </button>
        </div>
      )}

      {/* YOLO エクスポート */}
      {annotatedCount > 0 && (
        <div className="panel" style={{ padding: "1.25rem", marginTop: 0 }}>
          <p className="eyebrow" style={{ marginBottom: "0.6rem" }}>
            YOLO フォーマットでエクスポート
          </p>
          <p className="muted" style={{ margin: "0 0 0.9rem" }}>
            各画像のアノテーションを YOLO 形式の .txt ファイルとして一括ダウンロードします。
            出力先はワークスペースで設定済みのリソースを自動利用します。
          </p>
          <button type="button" onClick={exportYOLO}>
            ラベルファイルをダウンロード (YOLO)
          </button>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <input
              value={exportPath}
              readOnly
              disabled
              placeholder="ワークスペースの出力先を自動使用"
              style={{ flex: "1 1 300px" }}
            />
            <button type="button" disabled>
              {saving ? "同期中..." : "自動設定"}
            </button>
          </div>
          {saved && <p style={{ marginTop: "0.6rem", color: "#7cf0ba" }}>✓ 出力先を同期しました</p>}
          {saveError && (
            <p className="form-error" style={{ marginTop: "0.6rem" }}>{saveError}</p>
          )}
        </div>
      )}
        </div>
      </div>
    </>
  );
}

/* ─── パラメータータブ ─── */
function ParamsTab({ workspace }: { workspace: WorkspaceInfo }) {
  const [epochs, setEpochs] = useState("100");
  const [batchSize, setBatchSize] = useState("16");
  const [lr, setLr] = useState("0.001");
  const [lrScheduler, setLrScheduler] = useState("cosine");
  const [optimizer, setOptimizer] = useState("Adam");
  const [imgSize, setImgSize] = useState("640");
  const [earlyStop, setEarlyStop] = useState("10");
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="studio-tab-content">
      <div className="studio-section-header">
        <div>
          <p className="eyebrow">Step 3</p>
          <h3>パラメーターチューニング</h3>
        </div>
        {workspace.selectedModel && (
          <span className="status draft">{workspace.selectedModel}</span>
        )}
      </div>

      <div className="studio-form-grid">
        <label className="db-control">
          エポック数
          <input type="number" min="1" max="3000" value={epochs} onChange={(e) => setEpochs(e.target.value)} />
        </label>
        <label className="db-control">
          バッチサイズ
          <select value={batchSize} onChange={(e) => setBatchSize(e.target.value)}>
            {["4", "8", "16", "32", "64", "128"].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="db-control">
          学習率 (LR)
          <input type="number" step="0.0001" min="0.00001" max="1" value={lr} onChange={(e) => setLr(e.target.value)} />
        </label>
        <label className="db-control">
          LRスケジューラー
          <select value={lrScheduler} onChange={(e) => setLrScheduler(e.target.value)}>
            <option value="cosine">Cosine Annealing</option>
            <option value="step">Step LR</option>
            <option value="linear">Linear</option>
            <option value="none">なし</option>
          </select>
        </label>
        <label className="db-control">
          オプティマイザー
          <select value={optimizer} onChange={(e) => setOptimizer(e.target.value)}>
            {["SGD", "Adam", "AdamW", "RMSProp"].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="db-control">
          入力画像サイズ
          <select value={imgSize} onChange={(e) => setImgSize(e.target.value)}>
            {["320", "416", "512", "640", "768", "1024"].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="db-control">
          Early Stopping (エポック)
          <input type="number" min="1" max="100" value={earlyStop} onChange={(e) => setEarlyStop(e.target.value)} />
        </label>
      </div>

      <div className="workflow-actions" style={{ marginTop: "1.5rem" }}>
        <button type="button" onClick={save}>
          パラメーターを保存
        </button>
        {saved && <span style={{ color: "#7cf0ba" }}>✓ 保存しました</span>}
      </div>
    </div>
  );
}

/* ─── 学習タブ ─── */
function TrainingTab({ workspace }: { workspace: WorkspaceInfo }) {
  const [phase, setPhase] = useState<"idle" | "running" | "paused" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const totalEpochs = 100;

  const start = () => {
    setPhase("running");
    setProgress(0);
    setEpoch(0);

    const interval = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(p + Math.random() * 3, 100);
        setEpoch(Math.floor((next / 100) * totalEpochs));
        if (next >= 100) {
          clearInterval(interval);
          setPhase("done");
        }
        return next;
      });
    }, 400);
  };

  const pause = () => setPhase("paused");
  const resume = () => {
    setPhase("running");
    start();
  };

  return (
    <div className="studio-tab-content">
      <div className="studio-section-header">
        <div>
          <p className="eyebrow">Step 4</p>
          <h3>学習</h3>
        </div>
        <span className={
          phase === "done" ? "status ready" :
          phase === "running" ? "status training" :
          phase === "paused" ? "status draft" : "status draft"
        }>
          {phase === "done" ? "完了" : phase === "running" ? "学習中" : phase === "paused" ? "一時停止" : "待機中"}
        </span>
      </div>

      <div className="studio-info-row">
        <div className="summary-item">
          <span>モデル</span>
          <strong>{workspace.selectedModel || "未選択"}</strong>
        </div>
        <div className="summary-item">
          <span>手法</span>
          <strong>{targetLabels[workspace.target] ?? workspace.target}</strong>
        </div>
        <div className="summary-item">
          <span>データセットフォルダ</span>
          <strong>
            {workspace.annotationExportPath || workspace.datasetFolder || "未設定"}
            {workspace.annotationExportPath && (
              <span className="status ready" style={{ marginLeft: "0.5rem", fontSize: "0.72rem" }}>
                アノテーション済み
              </span>
            )}
          </strong>
        </div>
      </div>

      {phase !== "idle" && (
        <div style={{ marginTop: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span>Epoch {epoch} / {totalEpochs}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="progress-bar large">
            <div style={{ width: `${progress}%` }} />
          </div>
          <div className="studio-metrics-row">
            <div className="summary-item">
              <span>損失 (Loss)</span>
              <strong>{(1.2 - progress * 0.01).toFixed(4)}</strong>
            </div>
            <div className="summary-item">
              <span>mAP50</span>
              <strong>{Math.min(0.95, progress * 0.009).toFixed(3)}</strong>
            </div>
            <div className="summary-item">
              <span>精度 (Precision)</span>
              <strong>{Math.min(0.97, 0.5 + progress * 0.005).toFixed(3)}</strong>
            </div>
            <div className="summary-item">
              <span>再現率 (Recall)</span>
              <strong>{Math.min(0.94, 0.45 + progress * 0.005).toFixed(3)}</strong>
            </div>
          </div>
        </div>
      )}
        {/* インポート画像サンプル */}
        {images.length > 0 && (
          <div style={{ marginTop: "0.75rem" }}>
            <p className="muted" style={{ fontSize: "0.7rem", margin: "0 0 0.5rem" }}>
              インポートされた画像 ({images.length})
            </p>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: "0.3rem",
            }}>
              {images.slice(0, 12).map((img) => (
                <div
                  key={img.name}
                  style={{
                    position: "relative",
                    aspectRatio: "1",
                    borderRadius: "4px",
                    overflow: "hidden",
                    border: "1px solid rgba(237, 241, 250, 0.1)",
                    backgroundColor: "rgba(0, 0, 0, 0.2)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.src}
                    alt={img.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  {img.regions.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "0.1rem",
                        right: "0.1rem",
                        background: "#7cf0ba",
                        color: "#0f1728",
                        fontSize: "0.5rem",
                        fontWeight: 700,
                        padding: "0.1rem 0.25rem",
                        borderRadius: "2px",
                        lineHeight: 1,
                      }}
                    >
                      {img.regions.length}
                    </div>
                  )}
                </div>
              ))}
              {images.length > 12 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.6rem",
                    color: "rgba(237, 241, 250, 0.4)",
                    borderRadius: "4px",
                    backgroundColor: "rgba(0, 0, 0, 0.2)",
                  }}
                >
                  +{images.length - 12}
                </div>
              )}
            </div>
          </div>
        )}

      <div className="workflow-actions" style={{ marginTop: "1.5rem" }}>
        {phase === "idle" && (
          <button type="button" onClick={start}>学習を開始</button>
        )}
        {phase === "running" && (
          <button type="button" className="ghost-button" onClick={pause}>一時停止</button>
        )}
        {phase === "paused" && (
          <>
            <button type="button" onClick={resume}>再開</button>
            <button type="button" className="ghost-button" onClick={() => { setPhase("idle"); setProgress(0); setEpoch(0); }}>
              リセット
            </button>
          </>
        )}
        {phase === "done" && (
          <span style={{ color: "#7cf0ba" }}>✓ 学習完了。結果確認タブで詳細を確認してください。</span>
        )}
      </div>
    </div>
  );
}

/* ─── 結果確認タブ ─── */
function ResultsTab({ workspace }: { workspace: WorkspaceInfo }) {
  const metrics = [
    { label: "mAP50",      value: "0.874" },
    { label: "mAP50-95",   value: "0.651" },
    { label: "Precision",  value: "0.912" },
    { label: "Recall",     value: "0.883" },
    { label: "F1 Score",   value: "0.897" },
    { label: "Inference",  value: "8.4 ms" },
  ];

  const confusions = [
    { cls: "defect",  tp: 312, fp: 28, fn: 41, precision: "0.918", recall: "0.884" },
    { cls: "ok",      tp: 891, fp: 12, fn: 9,  precision: "0.987", recall: "0.990" },
    { cls: "unknown", tp: 44,  fp: 18, fn: 22, precision: "0.710", recall: "0.667" },
  ];

  return (
    <div className="studio-tab-content">
      <div className="studio-section-header">
        <div>
          <p className="eyebrow">Step 5</p>
          <h3>結果確認</h3>
        </div>
        <span className="status ready">最新結果あり</span>
      </div>

      <div className="studio-metrics-row" style={{ marginBottom: "1.5rem" }}>
        {metrics.map((m) => (
          <div key={m.label} className="summary-item studio-metric-chip">
            <span>{m.label}</span>
            <strong>{m.value}</strong>
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: "1.5rem", padding: "1rem" }}>
        <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>クラス別評価</p>
        <div style={{ display: "grid", gap: "0.6rem" }}>
          <div className="studio-table-header">
            {["クラス", "TP", "FP", "FN", "Precision", "Recall"].map((h) => (
              <span key={h} style={{ fontSize: "0.75rem", color: "rgba(237,241,250,0.6)" }}>{h}</span>
            ))}
          </div>
          {confusions.map((row) => (
            <div key={row.cls} className="studio-table-row">
              <strong>{row.cls}</strong>
              <span>{row.tp}</span>
              <span>{row.fp}</span>
              <span>{row.fn}</span>
              <span>{row.precision}</span>
              <span>{row.recall}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="studio-info-row">
        <div className="summary-item">
          <span>チェックポイント</span>
          <strong>{workspace.datasetFolder ?? "未設定"}\best.pt</strong>
        </div>
        <div className="summary-item">
          <span>エクスポート形式</span>
          <strong>ONNX / TorchScript</strong>
        </div>
      </div>

      <div className="workflow-actions" style={{ marginTop: "1.5rem" }}>
        <button type="button">モデルをエクスポート</button>
        <button type="button" className="ghost-button">レポートをダウンロード</button>
      </div>
    </div>
  );
}

/* ─── メインコンポーネント ─── */
export function WorkspaceStudio({ workspace }: { workspace: WorkspaceInfo }) {
  const [activeTab, setActiveTab] = useState<StudioTab>("preprocess");

  const renderTab = () => {
    switch (activeTab) {
      case "preprocess":  return <PreprocessTab workspace={workspace} />;
      case "annotation":  return <AnnotationTab workspace={workspace} />;
      case "params":      return <ParamsTab workspace={workspace} />;
      case "training":    return <TrainingTab workspace={workspace} />;
      case "results":     return <ResultsTab workspace={workspace} />;
    }
  };

  return (
    <div className="workspace-content">
      {/* ヘッダー */}
      <section className="overview-hero">
        <div className="overview-greeting">
          <p className="eyebrow">
            <Link href="/dashboard/workspaces" className="studio-back-link">← ワークスペース一覧</Link>
          </p>
          <h2>{workspace.name}</h2>
          <p className="muted">
            {targetLabels[workspace.target] ?? workspace.target}
            {workspace.selectedModel && <> &nbsp;·&nbsp; {workspace.selectedModel}</>}
          </p>
        </div>

        <div className="overview-stats">
          <div className="overview-stat-chip">
            <span>接続先 DB</span>
            <strong style={{ fontSize: "1rem" }}>{workspace.databaseId || "未設定"}</strong>
          </div>
          <div className="overview-stat-chip">
            <span>入力フォルダ</span>
            <strong style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>{workspace.imageFolder || "未設定"}</strong>
          </div>
        </div>
      </section>

      {/* タブナビゲーション */}
      <div className="studio-tab-nav">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            className={`studio-tab-btn${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="studio-tab-index">{i + 1}</span>
            <span>{tab.icon} {tab.label}</span>
          </button>
        ))}
      </div>

      {/* タブコンテンツ */}
      <section className="panel">
        {renderTab()}
      </section>
    </div>
  );
}
