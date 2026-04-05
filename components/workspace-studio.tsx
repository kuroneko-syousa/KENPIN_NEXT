"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { AnnotateImage, AnyRegion, DrawTool } from "../types/annotate";
export type { AnnotateImage, AnyRegion, DrawTool } from "../types/annotate";

/* react-konva は SSR 非対応のため動的インポート */
type KonvaAnnotatorProps = {
  images: AnnotateImage[];
  currentIndex?: number;
  regionClsList: string[];
  defaultTool?: DrawTool;
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

/* ─── 前処理タブ ─── */
function PreprocessTab({ workspace }: { workspace: WorkspaceInfo }) {
  const [resize, setResize] = useState("640");
  const [normalize, setNormalize] = useState(true);
  const [removeBlur, setRemoveBlur] = useState(true);
  const [augFlip, setAugFlip] = useState(true);
  const [augRotate, setAugRotate] = useState(false);
  const [augBrightness, setAugBrightness] = useState(false);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");

  const run = () => {
    setStatus("running");
    setTimeout(() => setStatus("done"), 2000);
  };

  return (
    <div className="studio-tab-content">
      <div className="studio-section-header">
        <div>
          <p className="eyebrow">Step 1</p>
          <h3>画像前処理</h3>
        </div>
        <span className={status === "done" ? "status ready" : status === "running" ? "status training" : "status draft"}>
          {status === "done" ? "完了" : status === "running" ? "実行中" : "未実行"}
        </span>
      </div>

      <div className="studio-info-row">
        <div className="summary-item">
          <span>入力フォルダ</span>
          <strong>{workspace.imageFolder || "未設定"}</strong>
        </div>
        <div className="summary-item">
          <span>出力先</span>
          <strong>{workspace.datasetFolder || "未設定"}</strong>
        </div>
      </div>

      <div className="studio-form-grid">
        <label className="db-control">
          リサイズ (px)
          <select value={resize} onChange={(e) => setResize(e.target.value)}>
            {["320", "416", "512", "640", "768", "1024"].map((v) => (
              <option key={v} value={v}>{v} × {v}</option>
            ))}
          </select>
        </label>

        <div className="studio-checkboxes">
          <label className="checkbox-row">
            <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} />
            正規化 (0–1)
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={removeBlur} onChange={(e) => setRemoveBlur(e.target.checked)} />
            ブレ画像を除外
          </label>
        </div>

        <div className="studio-checkboxes">
          <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>オーグメンテーション</p>
          <label className="checkbox-row">
            <input type="checkbox" checked={augFlip} onChange={(e) => setAugFlip(e.target.checked)} />
            水平フリップ
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={augRotate} onChange={(e) => setAugRotate(e.target.checked)} />
            ランダム回転 (±15°)
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={augBrightness} onChange={(e) => setAugBrightness(e.target.checked)} />
            明度ジッター
          </label>
        </div>
      </div>

      <div className="workflow-actions" style={{ marginTop: "1.5rem" }}>
        <button type="button" onClick={run} disabled={status === "running"}>
          {status === "running" ? "実行中..." : "前処理を実行"}
        </button>
        {status === "done" && (
          <span style={{ color: "#7cf0ba" }}>✓ 前処理が完了しました</span>
        )}
      </div>
    </div>
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
  const [newClass, setNewClass] = useState("");
  const [exportPath, setExportPath] = useState(workspace.annotationExportPath);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [restoreInfo, setRestoreInfo] = useState<string | null>(null);

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

  /* アノテーター保存 → state 更新 + DB 永続化 */
  const handleAnnotationSave = async (updated: AnnotateImage[]) => {
    setImages(updated);
    setAnnotatorOpen(false);

    try {
      await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotationData: JSON.stringify(updated) }),
      });
    } catch {
      // 保存失敗は画面のメイン操作を妨げないようサイレント
      console.error("[AnnotationTab] annotationData の保存に失敗しました");
    }
  };

  /* 画像ファイル選択 → DataURL に変換 */
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const readers = files.map(
      (file) =>
        new Promise<AnnotateImage>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            // 既存のアノテーションが同名ファイルにあれば引き継ぐ
            const existing = images.find((img) => img.name === file.name);
            resolve({
              src: reader.result as string,
              name: file.name,
              regions: existing?.regions ?? [],
            });
          };
          reader.readAsDataURL(file);
        })
    );
    Promise.all(readers).then((imgs) => {
      setImages(imgs);
      setAnnotatorOpen(false);
    });
  };

  /* クラスラベル管理 */  const addClassLabel = () => {
    const trimmed = newClass.trim();
    if (trimmed && !regionClsList.includes(trimmed)) {
      setRegionClsList((prev) => [...prev, trimmed]);
    }
    setNewClass("");
  };

  /* YOLO フォーマット (.txt) をダウンロード */
  const exportYOLO = () => {
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
      a.download = img.name.replace(/\.[^.]+$/, ".txt");
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
  const saveExportPath = async () => {
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotationExportPath: exportPath }),
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
      <div className="studio-tab-content">
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
            アノテーションしたい画像ファイルを選択してください（複数可）
          </p>
          <label className="annotation-upload-label">
            <input
              type="file"
              multiple
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleImageUpload}
            />
            📂 画像を選択
          </label>
        </div>

        {images.length > 0 && (
          <div className="annotation-image-preview">
            {images.slice(0, 6).map((img) => (
              <div key={img.name} className="annotation-preview-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.src} alt={img.name} />
                {img.regions.length > 0 && (
                  <span className="annotation-preview-badge">{img.regions.length}</span>
                )}
              </div>
            ))}
            {images.length > 6 && (
              <div className="annotation-preview-more">+{images.length - 6}</div>
            )}
          </div>
        )}
      </div>

      {/* クラスラベル */}
      <div className="panel" style={{ padding: "1.25rem" }}>
        <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>クラスラベル</p>
        <div className="annotation-class-list">
          {regionClsList.map((cls) => (
            <span key={cls} className="annotation-class-tag">
              {cls}
              <button
                type="button"
                className="annotation-class-remove"
                onClick={() => setRegionClsList((prev) => prev.filter((c) => c !== cls))}
              >×</button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          <input
            value={newClass}
            onChange={(e) => setNewClass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addClassLabel()}
            placeholder="クラス名を追加..."
            style={{ flex: 1 }}
          />
          <button type="button" onClick={addClassLabel}>追加</button>
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
            ダウンロード先のパスを登録すると、学習タブに自動反映されます。
          </p>
          <button type="button" onClick={exportYOLO}>
            ラベルファイルをダウンロード (YOLO)
          </button>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <input
              value={exportPath}
              onChange={(e) => setExportPath(e.target.value)}
              placeholder="例: D:\annotations\workspace-abc\labels"
              style={{ flex: "1 1 300px" }}
            />
            <button type="button" onClick={saveExportPath} disabled={saving}>
              {saving ? "登録中..." : "エクスポートパスを登録"}
            </button>
          </div>
          {saved && <p style={{ marginTop: "0.6rem", color: "#7cf0ba" }}>✓ 登録しました</p>}
          {saveError && (
            <p className="form-error" style={{ marginTop: "0.6rem" }}>{saveError}</p>
          )}
        </div>
      )}
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
