"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { AnnotateImage, DrawTool } from "../types/annotate";
export type { AnnotateImage, AnyRegion, DrawTool } from "../types/annotate";
export type { PreprocessConfig } from "../lib/preprocess/applyPreprocess";

import { usePreprocess } from "../hooks/usePreprocess";
import { useAnnotation, toolMap } from "../hooks/useAnnotation";

import PreviewCanvas from "./studio/preprocess/PreviewCanvas";
import FullscreenPreview from "./studio/preprocess/FullscreenPreview";
import AnnotationToolbar from "./studio/annotation/AnnotationToolbar";
import ImageUploader from "./studio/annotation/ImageUploader";
import AnnotationSummary from "./studio/annotation/AnnotationSummary";
import AnnotationStats from "./studio/annotation/AnnotationStats";

/* KonvaAnnotator は SSR 非対応のため動的インポート */
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
    loading: () => (
      <p className="muted" style={{ padding: "2rem" }}>
        アノテーターを読み込み中...
      </p>
    ),
  }
);

export type WorkspaceInfo = {
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

type StudioTab = "preprocess" | "annotation" | "params" | "training" | "results";

const targetLabels: Record<string, string> = {
  "object-detection":  "物体検出",
  "anomaly-detection": "異常検知",
  segmentation:        "セグメンテーション",
  "ocr-inspection":    "OCR・文字検査",
  "pose-keypoint":     "姿勢推定・キーポイント",
};

const tabs: { id: StudioTab; label: string; icon: string }[] = [
  { id: "preprocess",  label: "前処理",       icon: "⚙️"  },
  { id: "annotation",  label: "アノテーション", icon: "🏷️"  },
  { id: "params",      label: "パラメーター",   icon: "🎛️"  },
  { id: "training",    label: "学習",          icon: "🚀"  },
  { id: "results",     label: "結果確認",       icon: "📊"  },
];

/* ─── 前処理タブ ─── */
function PreprocessTab({
  workspace,
  onConfigSaved,
}: {
  workspace: WorkspaceInfo;
  onConfigSaved: (json: string) => void;
}) {
  const p = usePreprocess(workspace.id, workspace.preprocessConfig, workspace.imageFolder, onConfigSaved);

  return (
    <>
      <FullscreenPreview
        open={p.fullscreenOpen}
        onClose={() => p.setFullscreenOpen(false)}
        previewImages={p.previewImages}
        previewIndex={p.previewIndex}
        onSelectPreview={p.setPreviewIndex}
        selectedPreview={p.selectedPreview}
        afterResult={p.afterResult}
        afterSrc={p.afterSrc}
        cfg={p.cfg}
        onConfigChange={p.set}
        saving={p.saving}
        saved={p.saved}
        saveError={p.saveError}
        onSave={p.saveConfig}
      />

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
            <strong>{p.previewSourceLabel || "未設定"}</strong>
          </div>
        </div>

        <PreviewCanvas
          previewImages={p.previewImages}
          previewIndex={p.previewIndex}
          onSelectPreview={p.setPreviewIndex}
          selectedPreview={p.selectedPreview}
          afterResult={p.afterResult}
          afterSrc={p.afterSrc}
          imageFolder={workspace.imageFolder}
          importLoading={p.importLoading}
          importError={p.importError}
          onImport={p.handleImport}
          onOpenFullscreen={() => p.setFullscreenOpen(true)}
        />

      </div>
    </>
  );
}

/* ─── アノテーションタブ（画像を親へ共有するラッパー込み） ─── */
function AnnotationTabWithShare({
  workspace,
  onImagesChange,
}: {
  workspace: WorkspaceInfo;
  onImagesChange: (imgs: AnnotateImage[]) => void;
}) {
  const a = useAnnotation(workspace);
  const { images } = a;

  const annotatorPortal = createPortal(
    <AnimatePresence>
      {a.annotatorOpen && images.length > 0 && (
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
            regionClsList={a.regionClsList}
            defaultTool={toolMap[workspace.target] ?? "box"}
            onClassListChange={a.setRegionClsList}
            onSave={async (updated) => {
              await a.handleAnnotationSave(updated);
              onImagesChange(updated);
            }}
            onClose={() => a.setAnnotatorOpen(false)}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );

  return (
    <>
      {annotatorPortal}
      <div style={{ display: "flex", gap: "1rem", position: "relative" }}>
        <div className="studio-tab-content" style={{ flex: 1 }}>
          <div className="studio-section-header">
            <div>
              <p className="eyebrow">Step 2</p>
              <h3>アノテーション</h3>
            </div>
            {a.annotatedCount > 0 && (
              <span className="status ready">
                {a.annotatedCount} 枚アノテーション済み
              </span>
            )}
          </div>

          <ImageUploader
            importSourceLabel={a.importSourceLabel}
            previewImages={a.importPreviewImages}
            restoreInfo={a.restoreInfo}
            imageFolder={workspace.imageFolder}
            onResourceImport={async () => {
              await a.handleResourceImport();
              onImagesChange(a.images);
            }}
            onFolderUpload={async (e) => {
              await a.handleFolderUpload(e);
              onImagesChange(a.images);
            }}
          />

          <AnnotationToolbar
            imagesCount={images.length}
            onOpen={() => a.setAnnotatorOpen(true)}
          />

          <AnnotationStats
            stats={a.annotationStats}
            regionClsList={a.regionClsList}
          />

          <AnnotationSummary
            annotatedCount={a.annotatedCount}
            onExportYOLOZip={a.handleExportYOLOZip}
          />
        </div>
      </div>
    </>
  );
}

/* ─── パラメータータブ 定数 ─── */
type ParamInnerTab = "basic" | "optimizer" | "augment";

type ModelParams = {
  epochs: string; batch: string; imgSize: string; patience: string;
  optimizer: string; lr0: string; lrf: string; momentum: string;
  weightDecay: string; warmupEpochs: string; warmupMomentum: string; warmupBiasLr: string;
  mosaic: string; flipLR: string; flipUD: string;
  hsvH: string; hsvS: string; hsvV: string;
  degrees: string; translate: string; scale: string; mixup: string;
};

const MODEL_OPTIONS = [
  { value: "yolov5n", label: "YOLOv5n (Nano)",    family: "yolov5" },
  { value: "yolov5s", label: "YOLOv5s (Small)",   family: "yolov5" },
  { value: "yolov5m", label: "YOLOv5m (Medium)",  family: "yolov5" },
  { value: "yolov5l", label: "YOLOv5l (Large)",   family: "yolov5" },
  { value: "yolov5x", label: "YOLOv5x (XLarge)",  family: "yolov5" },
  { value: "yolov8n", label: "YOLOv8n (Nano)",    family: "yolov8" },
  { value: "yolov8s", label: "YOLOv8s (Small)",   family: "yolov8" },
  { value: "yolov8m", label: "YOLOv8m (Medium)",  family: "yolov8" },
  { value: "yolov8l", label: "YOLOv8l (Large)",   family: "yolov8" },
  { value: "yolov8x", label: "YOLOv8x (XLarge)",  family: "yolov8" },
  { value: "yolov9c", label: "YOLOv9c (Compact)",  family: "yolov9" },
  { value: "yolov9e", label: "YOLOv9e (Extended)", family: "yolov9" },
  { value: "yolov10n", label: "YOLOv10n (Nano)",   family: "yolov10" },
  { value: "yolov10s", label: "YOLOv10s (Small)",  family: "yolov10" },
  { value: "yolov10m", label: "YOLOv10m (Medium)", family: "yolov10" },
  { value: "yolov10l", label: "YOLOv10l (Large)",  family: "yolov10" },
  { value: "yolov10x", label: "YOLOv10x (XLarge)", family: "yolov10" },
  { value: "yolo11n",  label: "YOLO11n (Nano)",    family: "yolo11" },
  { value: "yolo11s",  label: "YOLO11s (Small)",   family: "yolo11" },
  { value: "yolo11m",  label: "YOLO11m (Medium)",  family: "yolo11" },
  { value: "yolo11l",  label: "YOLO11l (Large)",   family: "yolo11" },
  { value: "yolo11x",  label: "YOLO11x (XLarge)",  family: "yolo11" },
  { value: "rtdetr-l", label: "RT-DETR-l (Large)", family: "rtdetr" },
  { value: "rtdetr-x", label: "RT-DETR-x (XLarge)", family: "rtdetr" },
];

// 公式リポジトリのデフォルト値
const FAMILY_DEFAULTS: Record<string, ModelParams> = {
  yolov5: {
    epochs: "300", batch: "16", imgSize: "640", patience: "100",
    optimizer: "SGD", lr0: "0.01", lrf: "0.01", momentum: "0.937",
    weightDecay: "0.0005", warmupEpochs: "3.0", warmupMomentum: "0.8", warmupBiasLr: "0.1",
    mosaic: "1.0", flipLR: "0.5", flipUD: "0.0",
    hsvH: "0.015", hsvS: "0.7", hsvV: "0.4",
    degrees: "0.0", translate: "0.1", scale: "0.5", mixup: "0.0",
  },
  yolov8: {
    epochs: "100", batch: "16", imgSize: "640", patience: "100",
    optimizer: "auto", lr0: "0.01", lrf: "0.01", momentum: "0.937",
    weightDecay: "0.0005", warmupEpochs: "3.0", warmupMomentum: "0.8", warmupBiasLr: "0.1",
    mosaic: "1.0", flipLR: "0.5", flipUD: "0.0",
    hsvH: "0.015", hsvS: "0.7", hsvV: "0.4",
    degrees: "0.0", translate: "0.1", scale: "0.5", mixup: "0.0",
  },
  yolov9: {
    epochs: "500", batch: "16", imgSize: "640", patience: "50",
    optimizer: "SGD", lr0: "0.01", lrf: "0.01", momentum: "0.937",
    weightDecay: "0.0005", warmupEpochs: "3.0", warmupMomentum: "0.8", warmupBiasLr: "0.1",
    mosaic: "1.0", flipLR: "0.5", flipUD: "0.0",
    hsvH: "0.015", hsvS: "0.7", hsvV: "0.4",
    degrees: "0.0", translate: "0.1", scale: "0.9", mixup: "0.15",
  },
  yolov10: {
    epochs: "500", batch: "256", imgSize: "640", patience: "50",
    optimizer: "SGD", lr0: "0.01", lrf: "0.01", momentum: "0.937",
    weightDecay: "0.0005", warmupEpochs: "3.0", warmupMomentum: "0.8", warmupBiasLr: "0.1",
    mosaic: "1.0", flipLR: "0.5", flipUD: "0.0",
    hsvH: "0.015", hsvS: "0.7", hsvV: "0.4",
    degrees: "0.0", translate: "0.1", scale: "0.5", mixup: "0.0",
  },
  yolo11: {
    epochs: "100", batch: "16", imgSize: "640", patience: "100",
    optimizer: "auto", lr0: "0.01", lrf: "0.01", momentum: "0.937",
    weightDecay: "0.0005", warmupEpochs: "3.0", warmupMomentum: "0.8", warmupBiasLr: "0.1",
    mosaic: "1.0", flipLR: "0.5", flipUD: "0.0",
    hsvH: "0.015", hsvS: "0.7", hsvV: "0.4",
    degrees: "0.0", translate: "0.1", scale: "0.5", mixup: "0.0",
  },
  rtdetr: {
    epochs: "72", batch: "2", imgSize: "640", patience: "50",
    optimizer: "AdamW", lr0: "0.0001", lrf: "0.01", momentum: "0.9",
    weightDecay: "0.0001", warmupEpochs: "0.0", warmupMomentum: "0.8", warmupBiasLr: "0.1",
    mosaic: "0.0", flipLR: "0.5", flipUD: "0.0",
    hsvH: "0.015", hsvS: "0.7", hsvV: "0.4",
    degrees: "0.0", translate: "0.1", scale: "0.5", mixup: "0.0",
  },
};

const getModelFamily = (key: string) =>
  MODEL_OPTIONS.find((m) => m.value === key)?.family ?? "yolov8";

const getDefaults = (key: string): ModelParams =>
  FAMILY_DEFAULTS[getModelFamily(key)] ?? FAMILY_DEFAULTS.yolov8;

/* ─── パラメータータブ ─── */
function ParamsTab({ workspace, onParamsSave }: { workspace: WorkspaceInfo; onParamsSave?: (key: string, params: ModelParams) => void }) {
  const isObjectDetection = workspace.target === "object-detection";

  const _rawModel = workspace.selectedModel?.toLowerCase().replace(/[\s-]/g, "") ?? "";
  const initialModel = isObjectDetection
    ? (MODEL_OPTIONS.some((m) => m.value === _rawModel) ? _rawModel : "yolov8n")
    : "";
  const [modelKey, setModelKey] = useState(initialModel);
  const [paramTab, setParamTab] = useState<ParamInnerTab>("basic");

  const d = getDefaults(modelKey);

  const [epochs,         setEpochs]         = useState(d.epochs);
  const [batch,          setBatch]           = useState(d.batch);
  const [imgSize,        setImgSize]         = useState(d.imgSize);
  const [patience,       setPatience]        = useState(d.patience);
  const [optimizer,      setOptimizer]       = useState(d.optimizer);
  const [lr0,            setLr0]             = useState(d.lr0);
  const [lrf,            setLrf]             = useState(d.lrf);
  const [momentum,       setMomentum]        = useState(d.momentum);
  const [weightDecay,    setWeightDecay]     = useState(d.weightDecay);
  const [warmupEpochs,   setWarmupEpochs]    = useState(d.warmupEpochs);
  const [warmupMomentum, setWarmupMomentum]  = useState(d.warmupMomentum);
  const [warmupBiasLr,   setWarmupBiasLr]    = useState(d.warmupBiasLr);
  const [mosaic,         setMosaic]          = useState(d.mosaic);
  const [flipLR,         setFlipLR]          = useState(d.flipLR);
  const [flipUD,         setFlipUD]          = useState(d.flipUD);
  const [hsvH,           setHsvH]            = useState(d.hsvH);
  const [hsvS,           setHsvS]            = useState(d.hsvS);
  const [hsvV,           setHsvV]            = useState(d.hsvV);
  const [degrees,        setDegrees]         = useState(d.degrees);
  const [translate,      setTranslate]       = useState(d.translate);
  const [scale,          setScale]           = useState(d.scale);
  const [mixup,          setMixup]           = useState(d.mixup);
  const [saved,          setSaved]           = useState(false);

  const handleModelChange = (next: string) => {
    setModelKey(next);
    const nd = getDefaults(next);
    setEpochs(nd.epochs); setBatch(nd.batch); setImgSize(nd.imgSize); setPatience(nd.patience);
    setOptimizer(nd.optimizer); setLr0(nd.lr0); setLrf(nd.lrf); setMomentum(nd.momentum);
    setWeightDecay(nd.weightDecay); setWarmupEpochs(nd.warmupEpochs);
    setWarmupMomentum(nd.warmupMomentum); setWarmupBiasLr(nd.warmupBiasLr);
    setMosaic(nd.mosaic); setFlipLR(nd.flipLR); setFlipUD(nd.flipUD);
    setHsvH(nd.hsvH); setHsvS(nd.hsvS); setHsvV(nd.hsvV);
    setDegrees(nd.degrees); setTranslate(nd.translate); setScale(nd.scale); setMixup(nd.mixup);
  };

  const innerTabs: { id: ParamInnerTab; label: string }[] = [
    { id: "basic",     label: "基本設定" },
    { id: "optimizer", label: "最適化"   },
    { id: "augment",   label: "データ拡張" },
  ];

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    background: "none", border: "none", padding: "0.5rem 1.1rem",
    cursor: "pointer", fontSize: "0.82rem",
    fontWeight: active ? 700 : 400,
    color: active ? "#edf1fa" : "rgba(237,241,250,0.45)",
    borderBottom: active ? "2px solid #7cf0ba" : "2px solid transparent",
    marginBottom: "-1px", transition: "color 0.15s",
  });

  return (
    <div className="studio-tab-content">
      <div className="studio-section-header">
        <div>
          <p className="eyebrow">Step 3</p>
          <h3>パラメーターチューニング</h3>
        </div>
        {isObjectDetection && modelKey && (
          <span className="status draft">
            {MODEL_OPTIONS.find((m) => m.value === modelKey)?.label ?? modelKey}
          </span>
        )}
      </div>

      {/* モデル選択（物体検出のみ） */}
      {isObjectDetection && (
        <div className="panel" style={{ padding: "1rem 1.25rem", marginBottom: "1.25rem" }}>
          <label className="db-control" style={{ margin: 0 }}>
            <span style={{ fontWeight: 600 }}>使用モデルを選択</span>
            <select value={modelKey} onChange={(e) => handleModelChange(e.target.value)}>
              <optgroup label="YOLOv5 (Ultralytics)">
                {MODEL_OPTIONS.filter((m) => m.family === "yolov5").map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </optgroup>
              <optgroup label="YOLOv8 (Ultralytics)">
                {MODEL_OPTIONS.filter((m) => m.family === "yolov8").map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </optgroup>
              <optgroup label="YOLOv9 (WongKinYiu)">
                {MODEL_OPTIONS.filter((m) => m.family === "yolov9").map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </optgroup>
              <optgroup label="YOLOv10 (THU-MIG)">
                {MODEL_OPTIONS.filter((m) => m.family === "yolov10").map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </optgroup>
              <optgroup label="YOLO11 (Ultralytics)">
                {MODEL_OPTIONS.filter((m) => m.family === "yolo11").map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </optgroup>
              <optgroup label="RT-DETR (Baidu)">
                {MODEL_OPTIONS.filter((m) => m.family === "rtdetr").map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </optgroup>
            </select>
          </label>
          <p className="muted" style={{ fontSize: "0.7rem", margin: "0.45rem 0 0" }}>
            モデルを変更するとパラメーターが公式リポジトリのデフォルト値にリセットされます。
          </p>
        </div>
      )}

      {/* 内部タブ */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(237,241,250,0.12)", marginBottom: "1.25rem" }}>
        {innerTabs.map((t) => (
          <button key={t.id} type="button" style={tabBtnStyle(paramTab === t.id)} onClick={() => setParamTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 基本設定 */}
      {paramTab === "basic" && (
        <div className="studio-form-grid">
          <label className="db-control">
            エポック数
            <input type="number" min="1" max="3000" value={epochs} onChange={(e) => setEpochs(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.epochs}</span>
          </label>
          <label className="db-control">
            バッチサイズ
            <select value={batch} onChange={(e) => setBatch(e.target.value)}>
              {["1","2","4","8","16","32","64","128","256"].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.batch}（-1 で AutoBatch）</span>
          </label>
          <label className="db-control">
            入力画像サイズ (imgsz)
            <select value={imgSize} onChange={(e) => setImgSize(e.target.value)}>
              {["320","416","512","640","768","1024","1280"].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.imgSize} px</span>
          </label>
          <label className="db-control">
            Early Stopping (patience)
            <input type="number" min="0" max="500" value={patience} onChange={(e) => setPatience(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.patience}（0 で無効）</span>
          </label>
        </div>
      )}

      {/* 最適化 */}
      {paramTab === "optimizer" && (
        <div className="studio-form-grid">
          <label className="db-control">
            オプティマイザー
            <select value={optimizer} onChange={(e) => setOptimizer(e.target.value)}>
              {["auto","SGD","Adam","AdamW","NAdam","RAdam","RMSProp"].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.optimizer}</span>
          </label>
          <label className="db-control">
            初期学習率 (lr0)
            <input type="number" step="0.0001" min="0.00001" max="1" value={lr0} onChange={(e) => setLr0(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.lr0}（SGD=0.01 / Adam=0.001）</span>
          </label>
          <label className="db-control">
            最終学習率係数 (lrf)
            <input type="number" step="0.001" min="0.0001" max="1" value={lrf} onChange={(e) => setLrf(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.lrf}（最終 LR = lr0 × lrf）</span>
          </label>
          <label className="db-control">
            モメンタム (momentum)
            <input type="number" step="0.001" min="0" max="0.999" value={momentum} onChange={(e) => setMomentum(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.momentum}（SGD momentum / Adam β1）</span>
          </label>
          <label className="db-control">
            重み減衰 (weight_decay)
            <input type="number" step="0.0001" min="0" max="0.1" value={weightDecay} onChange={(e) => setWeightDecay(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.weightDecay}（過学習抑制）</span>
          </label>
          <label className="db-control">
            ウォームアップエポック (warmup_epochs)
            <input type="number" step="0.5" min="0" max="10" value={warmupEpochs} onChange={(e) => setWarmupEpochs(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.warmupEpochs}（小数可）</span>
          </label>
          <label className="db-control">
            ウォームアップモメンタム (warmup_momentum)
            <input type="number" step="0.01" min="0" max="0.999" value={warmupMomentum} onChange={(e) => setWarmupMomentum(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.warmupMomentum}</span>
          </label>
          <label className="db-control">
            ウォームアップバイアス学習率 (warmup_bias_lr)
            <input type="number" step="0.01" min="0" max="0.5" value={warmupBiasLr} onChange={(e) => setWarmupBiasLr(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.warmupBiasLr}</span>
          </label>
        </div>
      )}

      {/* データ拡張 */}
      {paramTab === "augment" && (
        <div className="studio-form-grid">
          <label className="db-control">
            モザイク (mosaic)
            <input type="number" step="0.1" min="0" max="1" value={mosaic} onChange={(e) => setMosaic(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.mosaic}（0〜1 確率）</span>
          </label>
          <label className="db-control">
            左右反転 (fliplr)
            <input type="number" step="0.1" min="0" max="1" value={flipLR} onChange={(e) => setFlipLR(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.flipLR}（0〜1 確率）</span>
          </label>
          <label className="db-control">
            上下反転 (flipud)
            <input type="number" step="0.1" min="0" max="1" value={flipUD} onChange={(e) => setFlipUD(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.flipUD}（0〜1 確率）</span>
          </label>
          <label className="db-control">
            色相変動 (hsv_h)
            <input type="number" step="0.005" min="0" max="0.99" value={hsvH} onChange={(e) => setHsvH(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.hsvH}</span>
          </label>
          <label className="db-control">
            彩度変動 (hsv_s)
            <input type="number" step="0.1" min="0" max="0.99" value={hsvS} onChange={(e) => setHsvS(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.hsvS}</span>
          </label>
          <label className="db-control">
            明度変動 (hsv_v)
            <input type="number" step="0.1" min="0" max="0.99" value={hsvV} onChange={(e) => setHsvV(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.hsvV}</span>
          </label>
          <label className="db-control">
            回転 (degrees)
            <input type="number" step="5" min="-180" max="180" value={degrees} onChange={(e) => setDegrees(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.degrees}（± 度）</span>
          </label>
          <label className="db-control">
            平行移動 (translate)
            <input type="number" step="0.05" min="0" max="0.9" value={translate} onChange={(e) => setTranslate(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.translate}（± フレーム比率）</span>
          </label>
          <label className="db-control">
            スケール (scale)
            <input type="number" step="0.1" min="0" max="0.9" value={scale} onChange={(e) => setScale(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.scale}（± ゲイン）</span>
          </label>
          <label className="db-control">
            ミックスアップ (mixup)
            <input type="number" step="0.05" min="0" max="1" value={mixup} onChange={(e) => setMixup(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.68rem" }}>デフォルト: {d.mixup}（0〜1 確率）</span>
          </label>
        </div>
      )}

      <div className="workflow-actions" style={{ marginTop: "1.5rem" }}>
        <button type="button" onClick={() => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
          onParamsSave?.(modelKey, { epochs, batch, imgSize, patience, optimizer, lr0, lrf, momentum, weightDecay, warmupEpochs, warmupMomentum, warmupBiasLr, mosaic, flipLR, flipUD, hsvH, hsvS, hsvV, degrees, translate, scale, mixup });
        }}>
          パラメーターを保存
        </button>
        {saved && <span style={{ color: "#7cf0ba" }}>✓ 保存しました（STEP4学習に反映されます）</span>}
      </div>
    </div>
  );
}

/* ─── 学習タブ ─── */
function TrainingTab({
  workspace,
  images,
  savedModelKey,
  savedParams,
}: {
  workspace: WorkspaceInfo;
  images: AnnotateImage[];
  savedModelKey: string;
  savedParams: ModelParams;
}) {
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [totalEpochs, setTotalEpochs] = useState(() => parseInt(savedParams.epochs || "100", 10));
  const [logs, setLogs] = useState<string[]>([]);
  const [trainError, setTrainError] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const evtSourceRef = useRef<EventSource | null>(null);
  const logBoxRef = useRef<HTMLDivElement>(null);

  const [prepareState, setPrepareState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [prepareResult, setPrepareResult] = useState<{
    outputDir: string;
    imageCount: number;
    labelCount: number;
    classCount: number;
    trainCount?: number;
    valCount?: number;
  } | null>(null);
  const [prepareError, setPrepareError] = useState("");
  const [valRatio, setValRatio] = useState(20); // val の割合 (%)
  const [device, setDevice] = useState<"auto" | "cpu" | "cuda">("auto");


  // ログが追加されるたびに最下行へスクロール
  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [logs]);

  // タブ離脱時に SSE を切断
  useEffect(() => {
    return () => { evtSourceRef.current?.close(); };
  }, []);

  const classList = images.length > 0
    ? [...new Set(images.flatMap((img) => img.regions.map((r) => r.cls ?? "object")))]
    : ["object"];

  const handlePrepareTraining = async () => {
    setPrepareState("running");
    setPrepareError("");
    setPrepareResult(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/prepare-training`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classList, valRatio: valRatio / 100 }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPrepareError(json.error ?? "学習データの準備に失敗しました");
        setPrepareState("error");
        return;
      }
      setPrepareResult(json as typeof prepareResult);
      setPrepareState("done");
    } catch {
      setPrepareError("サーバーへの接続に失敗しました");
      setPrepareState("error");
    }
  };

  const handleStartTraining = async () => {
    setPhase("running");
    setProgress(0);
    setEpoch(0);
    setLogs([]);
    setTrainError("");
    const epochs = parseInt(savedParams.epochs || "100", 10);
    setTotalEpochs(epochs);

    let id: string;
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/start-training`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: savedModelKey.replace(/\.pt$/i, ""), params: savedParams, device }),
      });
      const json = await res.json();
      if (!res.ok || !json.jobId) {
        setTrainError(json.error ?? "学習の開始に失敗しました");
        setPhase("error");
        return;
      }
      id = json.jobId;
      setJobId(id);
    } catch {
      setTrainError("サーバーへの接続に失敗しました");
      setPhase("error");
      return;
    }

    const evtSource = new EventSource(`/api/workspaces/${workspace.id}/start-training?jobId=${id}`);
    evtSourceRef.current = evtSource;

    evtSource.addEventListener("log", (e) => {
      const { text } = JSON.parse(e.data) as { text: string };
      setLogs((prev) => [...prev, text]);
    });
    evtSource.addEventListener("progress", (e) => {
      const { epoch: ep, totalEpochs: total, progress: pct } = JSON.parse(e.data) as { epoch: number; totalEpochs: number; progress: number };
      setEpoch(ep);
      setTotalEpochs(total);
      setProgress(pct);
    });
    evtSource.addEventListener("done", (e) => {
      const { success } = JSON.parse(e.data) as { success: boolean };
      setPhase(success ? "done" : "error");
      if (!success) setTrainError("学習が異常終了しました。ログを確認してください。");
      evtSource.close();
    });
    evtSource.onerror = () => {
      setPhase("error");
      setTrainError("サーバーとの接続が切れました。");
      evtSource.close();
    };
  };

  const handleStopTraining = async () => {
    if (!jobId) return;
    evtSourceRef.current?.close();
    await fetch(`/api/workspaces/${workspace.id}/start-training?jobId=${jobId}`, { method: "DELETE" }).catch(() => {});
    setPhase("idle");
    setJobId(null);
  };

  const modelLabel = (MODEL_OPTIONS.find((m) => m.value === savedModelKey)?.label ?? savedModelKey) || "未選択";
  const datasetPath = prepareResult?.outputDir || workspace.annotationExportPath || workspace.datasetFolder || "未設定";

  return (
    <div className="studio-tab-content">
      <div className="studio-section-header">
        <div>
          <p className="eyebrow">Step 4</p>
          <h3>学習</h3>
        </div>
        <span className={phase === "done" ? "status ready" : phase === "running" ? "status training" : phase === "error" ? "status error" : "status draft"}>
          {phase === "done" ? "完了" : phase === "running" ? "学習中" : phase === "error" ? "エラー" : "待機中"}
        </span>
      </div>

      {/* 学習設定サマリー */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <div className="summary-item">
          <span>モデル</span>
          <strong>{modelLabel}</strong>
        </div>
        <div className="summary-item">
          <span>手法</span>
          <strong>{targetLabels[workspace.target] ?? workspace.target}</strong>
        </div>
        <div className="summary-item" style={{ gridColumn: "1 / -1" }}>
          <span>データセットフォルダ</span>
          <strong style={{ wordBreak: "break-all", fontSize: "0.78rem", lineHeight: 1.4 }}>
            {datasetPath}
            {prepareResult && (
              <span className="status ready" style={{ marginLeft: "0.5rem", fontSize: "0.68rem", verticalAlign: "middle" }}>準備済み</span>
            )}
          </strong>
        </div>
        <div className="summary-item">
          <span>エポック数</span>
          <strong>{savedParams.epochs}</strong>
        </div>
        <div className="summary-item">
          <span>バッチサイズ</span>
          <strong>{savedParams.batch}</strong>
        </div>
        <div className="summary-item">
          <span>画像サイズ</span>
          <strong>{savedParams.imgSize}px</strong>
        </div>
        <div className="summary-item">
          <span>オプティマイザー</span>
          <strong>{savedParams.optimizer}</strong>
        </div>
        <div className="summary-item">
          <span>デバイス</span>
          <strong>{device === "auto" ? "⚡ 自動" : device === "cpu" ? "🖥 CPU" : "🎮 GPU (CUDA)"}</strong>
        </div>
      </div>

      {/* 進捗バー */}
      {(phase === "running" || phase === "done") && (
        <div style={{ marginTop: "0.75rem", marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem", fontSize: "0.82rem" }}>
            <span>Epoch {epoch} / {totalEpochs}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="progress-bar large"><div style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      {/* ログ表示エリア */}
      {(logs.length > 0 || phase === "running") && (
        <div style={{ marginTop: "0.75rem" }}>
          <p className="eyebrow" style={{ marginBottom: "0.4rem", fontSize: "0.68rem" }}>学習ログ</p>
          <div
            ref={logBoxRef}
            style={{
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(237,241,250,0.1)",
              borderRadius: "6px",
              padding: "0.75rem",
              height: "220px",
              overflowY: "auto",
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
              fontSize: "0.7rem",
              lineHeight: 1.6,
              color: "rgba(237,241,250,0.75)",
            }}
          >
            {logs.length === 0 && phase === "running" && (
              <span style={{ color: "rgba(237,241,250,0.35)" }}>学習開始中...</span>
            )}
            {logs.map((line, i) => (
              <div key={i} style={{
                color: line.startsWith("[ERROR]") ? "#ff6b6b"
                  : line.includes("Results saved") || line.includes("best.pt") ? "#7cf0ba"
                  : "inherit",
              }}>{line}</div>
            ))}
            {phase === "running" && (
              <div style={{ color: "rgba(237,241,250,0.35)" }}>▊</div>
            )}
          </div>
        </div>
      )}

      {trainError && (
        <p className="form-error" style={{ marginTop: "0.5rem" }}>{trainError}</p>
      )}

      {/* 画像サムネイル */}
      {images.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <p className="muted" style={{ fontSize: "0.7rem", margin: "0 0 0.4rem" }}>インポートされた画像 ({images.length})</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "0.25rem" }}>
            {images.slice(0, 16).map((img) => (
              <div key={img.name} style={{ position: "relative", aspectRatio: "1", borderRadius: "3px", overflow: "hidden",
                border: "1px solid rgba(237,241,250,0.08)", backgroundColor: "rgba(0,0,0,0.2)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.src} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {img.regions.length > 0 && (
                  <div style={{ position: "absolute", top: "0.1rem", right: "0.1rem", background: "#7cf0ba",
                    color: "#0f1728", fontSize: "0.45rem", fontWeight: 700, padding: "0.1rem 0.2rem",
                    borderRadius: "2px", lineHeight: 1 }}>
                    {img.regions.length}
                  </div>
                )}
              </div>
            ))}
            {images.length > 16 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.55rem", color: "rgba(237,241,250,0.4)", borderRadius: "3px", backgroundColor: "rgba(0,0,0,0.2)" }}>
                +{images.length - 16}
              </div>
            )}
          </div>
        </div>
      )}

      {/* デバイス選択 */}
      <div className="panel" style={{ padding: "0.75rem 1.25rem", marginTop: "1.25rem" }}>
        <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>学習デバイス</p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {(["auto", "cpu", "cuda"] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={device === d ? "" : "ghost-button"}
              onClick={() => setDevice(d)}
              disabled={phase === "running"}
              style={{ padding: "0.3rem 0.9rem", fontSize: "0.78rem" }}
            >
              {d === "auto" ? "⚡ 自動" : d === "cpu" ? "🖥 CPU" : "🎮 GPU (CUDA)"}
            </button>
          ))}
        </div>
        <p className="muted" style={{ fontSize: "0.68rem", margin: "0.5rem 0 0" }}>
          {device === "auto"
            ? "起動時にGPU（CUDA）を自動検出し、利用できなければCPUを使用します"
            : device === "cuda"
            ? "GPU（CUDA）を強制使用します。利用できない場合はCPUにフォールバックします"
            : "CPUを強制使用します（GPU環境でも常にCPUで学習します）"}
        </p>
      </div>

      {/* データセット分割設定 */}
      <div className="panel" style={{ padding: "1rem 1.25rem", marginTop: "1.25rem" }}>
        <p className="eyebrow" style={{ marginBottom: "0.6rem" }}>データセット分割設定</p>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <label className="db-control" style={{ flex: "1 1 220px", margin: 0 }}>
            <span>検証（val）の割合</span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                value={valRatio}
                onChange={(e) => setValRatio(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <strong style={{ minWidth: "2.5rem", textAlign: "right" }}>{valRatio}%</strong>
            </div>
            <span className="muted" style={{ fontSize: "0.68rem" }}>
              train: {100 - valRatio}% / val: {valRatio}%（ランダム分割）
            </span>
          </label>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {[10, 20, 30].map((v) => (
              <button
                key={v}
                type="button"
                className={valRatio === v ? "" : "ghost-button"}
                onClick={() => setValRatio(v)}
                style={{ padding: "0.3rem 0.75rem", fontSize: "0.76rem" }}
              >
                {100 - v}/{v}
              </button>
            ))}
          </div>
        </div>
        <p className="muted" style={{ fontSize: "0.68rem", margin: "0.6rem 0 0" }}>
          出力先: <code>tmp/workspaces/…/dataset/images/train</code> および <code>val</code>
        </p>
      </div>

      {/* 学習データ準備 */}
      <div className="workflow-actions" style={{ marginTop: "1.25rem" }}>
        <button
          type="button"
          className={prepareState === "done" ? "ghost-button" : ""}
          onClick={handlePrepareTraining}
          disabled={prepareState === "running" || phase === "running"}
        >
          {prepareState === "running" ? "準備中..." : prepareState === "done" ? "🔄 再準備する" : "📂 学習データを準備"}
        </button>
        {prepareState === "done" && prepareResult && (
          <span style={{ fontSize: "0.78rem", color: "#7cf0ba" }}>
            ✓ {prepareResult.imageCount}枚（train: {prepareResult.trainCount ?? "?"} / val: {prepareResult.valCount ?? "?"}）・{prepareResult.labelCount}ラベル・{prepareResult.classCount}クラス
          </span>
        )}
        {prepareState === "error" && (
          <p className="form-error" style={{ marginTop: "0.25rem" }}>{prepareError}</p>
        )}
      </div>

      {/* 学習実行 */}
      <div className="workflow-actions" style={{ marginTop: "0.75rem" }}>
        {phase === "idle" && (
          <button
            type="button"
            onClick={handleStartTraining}
            disabled={prepareState !== "done"}
            title={prepareState !== "done" ? "先に学習データを準備してください" : ""}
          >
            🚀 学習を開始
          </button>
        )}
        {phase === "running" && (
          <button type="button" className="ghost-button" onClick={handleStopTraining}>
            ⏹ 学習を中断
          </button>
        )}
        {phase === "error" && (
          <button type="button" className="ghost-button" onClick={() => { setPhase("idle"); setLogs([]); setProgress(0); setEpoch(0); }}>
            リセット
          </button>
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
    { label: "mAP50",     value: "0.874" }, { label: "mAP50-95", value: "0.651" },
    { label: "Precision", value: "0.912" }, { label: "Recall",   value: "0.883" },
    { label: "F1 Score",  value: "0.897" }, { label: "Inference", value: "8.4 ms" },
  ];
  const confusions = [
    { cls: "defect",  tp: 312, fp: 28, fn: 41, precision: "0.918", recall: "0.884" },
    { cls: "ok",      tp: 891, fp: 12, fn: 9,  precision: "0.987", recall: "0.990" },
    { cls: "unknown", tp: 44,  fp: 18, fn: 22, precision: "0.710", recall: "0.667" },
  ];

  return (
    <div className="studio-tab-content">
      <div className="studio-section-header">
        <div><p className="eyebrow">Step 5</p><h3>結果確認</h3></div>
        <span className="status ready">最新結果あり</span>
      </div>
      <div className="studio-metrics-row" style={{ marginBottom: "1.5rem" }}>
        {metrics.map((m) => (
          <div key={m.label} className="summary-item studio-metric-chip">
            <span>{m.label}</span><strong>{m.value}</strong>
          </div>
        ))}
      </div>
      <div className="panel" style={{ marginBottom: "1.5rem", padding: "1rem" }}>
        <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>クラス別評価</p>
        <div style={{ display: "grid", gap: "0.6rem" }}>
          <div className="studio-table-header">
            {["クラス","TP","FP","FN","Precision","Recall"].map((h) => (
              <span key={h} style={{ fontSize: "0.75rem", color: "rgba(237,241,250,0.6)" }}>{h}</span>
            ))}
          </div>
          {confusions.map((row) => (
            <div key={row.cls} className="studio-table-row">
              <strong>{row.cls}</strong><span>{row.tp}</span><span>{row.fp}</span>
              <span>{row.fn}</span><span>{row.precision}</span><span>{row.recall}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="studio-info-row">
        <div className="summary-item"><span>チェックポイント</span><strong>{workspace.datasetFolder ?? "未設定"}\best.pt</strong></div>
        <div className="summary-item"><span>エクスポート形式</span><strong>ONNX / TorchScript</strong></div>
      </div>
      <div className="workflow-actions" style={{ marginTop: "1.5rem" }}>
        <button type="button">モデルをエクスポート</button>
        <button type="button" className="ghost-button">レポートをダウンロード</button>
      </div>
    </div>
  );
}

/* ─── メインコンポーネント（コンポジションルート） ─── */
export function WorkspaceStudio({ workspace }: { workspace: WorkspaceInfo }) {
  const [activeTab, setActiveTab] = useState<StudioTab>("preprocess");
  const [sharedImages, setSharedImages] = useState<AnnotateImage[]>([]);
  const [livePreprocessConfig, setLivePreprocessConfig] = useState(workspace.preprocessConfig);

  const _rawModelKey = workspace.selectedModel?.toLowerCase().replace(/[\s-]/g, "") ?? "";
  const initialModelKey = workspace.target === "object-detection"
    ? (MODEL_OPTIONS.some((m) => m.value === _rawModelKey) ? _rawModelKey : "yolov8n")
    : "";
  const [savedModelKey, setSavedModelKey] = useState(initialModelKey);
  const [savedParams, setSavedParams] = useState<ModelParams>(() => getDefaults(initialModelKey || "yolov8n"));

  const handleParamsSave = (key: string, params: ModelParams) => {
    setSavedModelKey(key.replace(/\.pt$/i, ""));
    setSavedParams(params);
  };

  const liveWorkspace = { ...workspace, preprocessConfig: livePreprocessConfig };

  const renderTab = () => {
    switch (activeTab) {
      case "preprocess": return <PreprocessTab workspace={liveWorkspace} onConfigSaved={setLivePreprocessConfig} />;
      case "annotation": return <AnnotationTabWithShare workspace={liveWorkspace} onImagesChange={setSharedImages} />;
      case "params":     return <ParamsTab workspace={workspace} onParamsSave={handleParamsSave} />;
      case "training":   return <TrainingTab workspace={workspace} images={sharedImages} savedModelKey={savedModelKey} savedParams={savedParams} />;
      case "results":    return <ResultsTab workspace={workspace} />;
    }
  };

  return (
    <div className="workspace-content">
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

      <div className="studio-tab-nav">
        {tabs.map((tab, i) => (
          <button key={tab.id} type="button"
            className={`studio-tab-btn${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}>
            <span className="studio-tab-index">{i + 1}</span>
            <span>{tab.icon} {tab.label}</span>
          </button>
        ))}
      </div>

      <section className="panel">{renderTab()}</section>
    </div>
  );
}
