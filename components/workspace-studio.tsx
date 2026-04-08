"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
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
function PreprocessTab({ workspace }: { workspace: WorkspaceInfo }) {
  const p = usePreprocess(workspace.id, workspace.preprocessConfig, workspace.imageFolder);

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
            onFolderUpload={async (e) => {
              await a.handleFolderUpload(e);
              onImagesChange(a.images);
            }}
          />

          <AnnotationToolbar
            imagesCount={images.length}
            onOpen={() => a.setAnnotatorOpen(true)}
          />

          <AnnotationSummary
            annotatedCount={a.annotatedCount}
            exportPath={a.exportPath}
            saving={a.saving}
            saved={a.saved}
            saveError={a.saveError}
            onExportYOLO={a.handleExportYOLO}
          />
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
        <button type="button" onClick={save}>パラメーターを保存</button>
        {saved && <span style={{ color: "#7cf0ba" }}>✓ 保存しました</span>}
      </div>
    </div>
  );
}

/* ─── 学習タブ ─── */
function TrainingTab({
  workspace,
  images,
}: {
  workspace: WorkspaceInfo;
  images: AnnotateImage[];
}) {
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
        if (next >= 100) { clearInterval(interval); setPhase("done"); }
        return next;
      });
    }, 400);
  };

  return (
    <div className="studio-tab-content">
      <div className="studio-section-header">
        <div>
          <p className="eyebrow">Step 4</p>
          <h3>学習</h3>
        </div>
        <span className={phase === "done" ? "status ready" : phase === "running" ? "status training" : "status draft"}>
          {phase === "done" ? "完了" : phase === "running" ? "学習中" : phase === "paused" ? "一時停止" : "待機中"}
        </span>
      </div>

      <div className="studio-info-row">
        <div className="summary-item"><span>モデル</span><strong>{workspace.selectedModel || "未選択"}</strong></div>
        <div className="summary-item"><span>手法</span><strong>{targetLabels[workspace.target] ?? workspace.target}</strong></div>
        <div className="summary-item">
          <span>データセットフォルダ</span>
          <strong>
            {workspace.annotationExportPath || workspace.datasetFolder || "未設定"}
            {workspace.annotationExportPath && (
              <span className="status ready" style={{ marginLeft: "0.5rem", fontSize: "0.72rem" }}>アノテーション済み</span>
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
          <div className="progress-bar large"><div style={{ width: `${progress}%` }} /></div>
          <div className="studio-metrics-row">
            {[
              { label: "損失 (Loss)",      value: (1.2 - progress * 0.01).toFixed(4) },
              { label: "mAP50",            value: Math.min(0.95, progress * 0.009).toFixed(3) },
              { label: "精度 (Precision)", value: Math.min(0.97, 0.5 + progress * 0.005).toFixed(3) },
              { label: "再現率 (Recall)",  value: Math.min(0.94, 0.45 + progress * 0.005).toFixed(3) },
            ].map((m) => (
              <div key={m.label} className="summary-item"><span>{m.label}</span><strong>{m.value}</strong></div>
            ))}
          </div>
        </div>
      )}

      {images.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <p className="muted" style={{ fontSize: "0.7rem", margin: "0 0 0.5rem" }}>インポートされた画像 ({images.length})</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.3rem" }}>
            {images.slice(0, 12).map((img) => (
              <div key={img.name} style={{ position: "relative", aspectRatio: "1", borderRadius: "4px", overflow: "hidden",
                border: "1px solid rgba(237,241,250,0.1)", backgroundColor: "rgba(0,0,0,0.2)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.src} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {img.regions.length > 0 && (
                  <div style={{ position: "absolute", top: "0.1rem", right: "0.1rem", background: "#7cf0ba",
                    color: "#0f1728", fontSize: "0.5rem", fontWeight: 700, padding: "0.1rem 0.25rem",
                    borderRadius: "2px", lineHeight: 1 }}>
                    {img.regions.length}
                  </div>
                )}
              </div>
            ))}
            {images.length > 12 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.6rem", color: "rgba(237,241,250,0.4)", borderRadius: "4px", backgroundColor: "rgba(0,0,0,0.2)" }}>
                +{images.length - 12}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="workflow-actions" style={{ marginTop: "1.5rem" }}>
        {phase === "idle" && <button type="button" onClick={start}>学習を開始</button>}
        {phase === "running" && <button type="button" className="ghost-button" onClick={() => setPhase("paused")}>一時停止</button>}
        {phase === "paused" && (
          <>
            <button type="button" onClick={() => { setPhase("running"); start(); }}>再開</button>
            <button type="button" className="ghost-button" onClick={() => { setPhase("idle"); setProgress(0); setEpoch(0); }}>リセット</button>
          </>
        )}
        {phase === "done" && <span style={{ color: "#7cf0ba" }}>✓ 学習完了。結果確認タブで詳細を確認してください。</span>}
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

  const renderTab = () => {
    switch (activeTab) {
      case "preprocess": return <PreprocessTab workspace={workspace} />;
      case "annotation": return <AnnotationTabWithShare workspace={workspace} onImagesChange={setSharedImages} />;
      case "params":     return <ParamsTab workspace={workspace} />;
      case "training":   return <TrainingTab workspace={workspace} images={sharedImages} />;
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
