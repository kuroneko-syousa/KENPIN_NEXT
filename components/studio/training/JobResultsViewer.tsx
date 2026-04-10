"use client";

/**
 * JobResultsViewer — YOLO 学習結果表示コンポーネント
 *
 * 表示内容
 *  - results.png / confusion_matrix.png などの結果画像
 *  - Loss（train / val）の推移グラフ
 *  - mAP（mAP50 / mAP50-95）の推移グラフ
 *  - 直近エポックのメトリクスサマリー
 *  - best.pt ダウンロードボタン
 *
 * 使用例
 *  <JobResultsViewer jobId="abc-123" />
 *  <JobResultsViewer jobId="abc-123" onClose={() => setOpen(false)} />
 */

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  fetchJobResults,
  jobImageUrl,
  type JobResults,
  type EpochMetrics,
} from "@/lib/jobApi";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 既知の YOLO 結果画像ファイル名（存在するものだけ表示） */
const KNOWN_RESULT_IMAGES = [
  "results.png",
  "confusion_matrix.png",
  "confusion_matrix_normalized.png",
  "P_curve.png",
  "R_curve.png",
  "PR_curve.png",
  "F1_curve.png",
  "labels.jpg",
  "labels_correlogram.jpg",
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface JobResultsViewerProps {
  /** 表示対象のジョブ ID */
  jobId: string;
  /** パネルを閉じるボタンを表示するコールバック（省略時はボタン非表示） */
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// メトリクスグラフ用のデータ変換
// ---------------------------------------------------------------------------

/** recharts 用に epoch を x 軸として Loss 系列データを構築 */
function buildLossChartData(
  history: Partial<EpochMetrics>[],
): { epoch: number; trainBox: number | null; valBox: number | null; trainCls: number | null; valCls: number | null }[] {
  return history.map((row) => ({
    epoch: (row.epoch as number) ?? 0,
    trainBox: (row["train/box_loss"] as number | null) ?? null,
    valBox: (row["val/box_loss"] as number | null) ?? null,
    trainCls: (row["train/cls_loss"] as number | null) ?? null,
    valCls: (row["val/cls_loss"] as number | null) ?? null,
  }));
}

/** recharts 用に epoch を x 軸として mAP 系列データを構築 */
function buildMapChartData(
  history: Partial<EpochMetrics>[],
): { epoch: number; mAP50: number | null; mAP5095: number | null }[] {
  return history.map((row) => ({
    epoch: (row.epoch as number) ?? 0,
    mAP50: (row["metrics/mAP50(B)"] as number | null) ?? null,
    mAP5095: (row["metrics/mAP50-95(B)"] as number | null) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export default function JobResultsViewer({ jobId, onClose }: JobResultsViewerProps) {
  const [results, setResults] = useState<JobResults | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // ─── データ取得 ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const data = await fetchJobResults(jobId);
      setResults(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "取得エラー");
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  // ─── ローディング ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={styles.root}>
        <div style={styles.loadingMessage}>結果を読み込み中...</div>
      </div>
    );
  }

  // ─── エラー ────────────────────────────────────────────────────────────
  if (fetchError) {
    return (
      <div style={styles.root}>
        <div style={styles.errorBanner}>⚠ {fetchError}</div>
        <button
          type="button"
          className="ghost-button"
          style={styles.retryBtn}
          onClick={load}
        >
          再試行
        </button>
      </div>
    );
  }

  // ─── データ未生成（学習中または未開始） ────────────────────────────────
  if (!results || (!results.run_dir && results.images.length === 0 && results.metrics_history.length === 0)) {
    return (
      <div style={styles.root}>
        <div style={styles.emptyMessage}>
          学習結果はまだ生成されていません。
          <br />
          学習完了後に再度確認してください。
        </div>
        <button
          type="button"
          className="ghost-button"
          style={styles.retryBtn}
          onClick={load}
        >
          再読み込み
        </button>
      </div>
    );
  }

  // ─── データ準備 ────────────────────────────────────────────────────────

  // サーバーから返ってきた絶対パスのうち、既知のファイル名に合致するものを抽出
  const availableImageNames = new Set(
    results.images.map((p) => p.replace(/\\/g, "/").split("/").pop() ?? ""),
  );

  // 既知リスト順でフィルタリング（存在するものだけ）
  const orderedImages = KNOWN_RESULT_IMAGES.filter((name) =>
    availableImageNames.has(name),
  );

  // 既知リストに含まれないその他の画像
  const otherImages = [...availableImageNames].filter(
    (name) => !KNOWN_RESULT_IMAGES.includes(name as (typeof KNOWN_RESULT_IMAGES)[number]),
  );

  const allDisplayImages = [...orderedImages, ...otherImages];

  const lossData = buildLossChartData(results.metrics_history);
  const mapData = buildMapChartData(results.metrics_history);
  const hasLossData = lossData.length > 0;
  const hasMapData = mapData.length > 0;

  // 直近エポックのメトリクス（表示用）
  const lastMetrics = results.metrics;
  const mAP50 = lastMetrics["metrics/mAP50(B)"];
  const mAP5095 = lastMetrics["metrics/mAP50-95(B)"];
  const precision = lastMetrics["metrics/precision(B)"];
  const recall = lastMetrics["metrics/recall(B)"];
  const valBoxLoss = lastMetrics["val/box_loss"];
  const totalEpochs = results.metrics_history.length;

  // ─── 描画 ─────────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      {/* ─── ヘッダー ─── */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>学習結果</span>
          <span style={styles.jobIdBadge} title={jobId}>
            {jobId.slice(0, 8)}…
          </span>
          {totalEpochs > 0 && (
            <span style={styles.epochBadge}>{totalEpochs} epochs</span>
          )}
        </div>
        <div style={styles.headerRight}>
          {/* best.pt ダウンロードボタン */}
          {results.weights && (
            <a
              href={`${typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000") : "http://localhost:8000"}/jobs/${encodeURIComponent(jobId)}/weights`}
              download="best.pt"
              style={styles.downloadLink}
              title="best.pt をダウンロード"
            >
              ⬇ best.pt
            </a>
          )}
          {onClose && (
            <button
              type="button"
              className="ghost-button"
              style={styles.closeBtn}
              onClick={onClose}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ─── メトリクスサマリー ─── */}
      {(mAP50 !== undefined || mAP5095 !== undefined || precision !== undefined || recall !== undefined) && (
        <div style={styles.metricsSummary}>
          <MetricCard
            label="mAP50"
            value={mAP50 != null ? (mAP50 as number).toFixed(4) : "—"}
            highlight
          />
          <MetricCard
            label="mAP50-95"
            value={mAP5095 != null ? (mAP5095 as number).toFixed(4) : "—"}
            highlight
          />
          <MetricCard
            label="Precision"
            value={precision != null ? (precision as number).toFixed(4) : "—"}
          />
          <MetricCard
            label="Recall"
            value={recall != null ? (recall as number).toFixed(4) : "—"}
          />
          <MetricCard
            label="val/box_loss"
            value={valBoxLoss != null ? (valBoxLoss as number).toFixed(4) : "—"}
          />
        </div>
      )}

      {/* ─── グラフエリア ─── */}
      {(hasLossData || hasMapData) && (
        <div style={styles.chartsArea}>
          {/* Loss グラフ */}
          {hasLossData && (
            <div style={styles.chartCard}>
              <div style={styles.chartTitle}>Loss（train / val）</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={lossData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis
                    dataKey="epoch"
                    tick={{ fill: "rgba(237,241,250,0.5)", fontSize: 10 }}
                    label={{
                      value: "epoch",
                      position: "insideBottomRight",
                      offset: -4,
                      fill: "rgba(237,241,250,0.4)",
                      fontSize: 10,
                    }}
                  />
                  <YAxis
                    tick={{ fill: "rgba(237,241,250,0.5)", fontSize: 10 }}
                    width={46}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "rgba(237,241,250,0.7)", fontSize: 11 }}
                    itemStyle={{ fontSize: 11 }}
                    formatter={(value: number | null) =>
                      value != null ? value.toFixed(5) : "—"
                    }
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "rgba(237,241,250,0.65)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="trainBox"
                    name="train/box_loss"
                    stroke="#60a5fa"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="valBox"
                    name="val/box_loss"
                    stroke="#f472b6"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="trainCls"
                    name="train/cls_loss"
                    stroke="#34d399"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="4 2"
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="valCls"
                    name="val/cls_loss"
                    stroke="#fb923c"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="4 2"
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* mAP グラフ */}
          {hasMapData && (
            <div style={styles.chartCard}>
              <div style={styles.chartTitle}>mAP</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={mapData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis
                    dataKey="epoch"
                    tick={{ fill: "rgba(237,241,250,0.5)", fontSize: 10 }}
                    label={{
                      value: "epoch",
                      position: "insideBottomRight",
                      offset: -4,
                      fill: "rgba(237,241,250,0.4)",
                      fontSize: 10,
                    }}
                  />
                  <YAxis
                    domain={[0, 1]}
                    tick={{ fill: "rgba(237,241,250,0.5)", fontSize: 10 }}
                    width={46}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "rgba(237,241,250,0.7)", fontSize: 11 }}
                    itemStyle={{ fontSize: 11 }}
                    formatter={(value: number | null) =>
                      value != null ? value.toFixed(4) : "—"
                    }
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "rgba(237,241,250,0.65)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="mAP50"
                    name="mAP50"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="mAP5095"
                    name="mAP50-95"
                    stroke="#fbbf24"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ─── 結果画像サムネイルグリッド ─── */}
      {allDisplayImages.length > 0 && (
        <div style={styles.imagesSection}>
          <div style={styles.sectionTitle}>結果画像</div>
          <div style={styles.imageGrid}>
            {allDisplayImages.map((filename) => (
              <button
                key={filename}
                type="button"
                style={styles.imageThumbnailBtn}
                onClick={() => setSelectedImage(filename)}
                title={filename}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={jobImageUrl(jobId, filename)}
                  alt={filename}
                  style={styles.thumbnailImg}
                  loading="lazy"
                />
                <span style={styles.imageLabel}>{filename}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── 再読み込みボタン ─── */}
      <div style={styles.footerRow}>
        <button
          type="button"
          className="ghost-button"
          style={styles.reloadBtn}
          onClick={load}
        >
          再読み込み
        </button>
      </div>

      {/* ─── 画像ライトボックス ─── */}
      {selectedImage && (
        <div
          style={styles.lightboxOverlay}
          onClick={() => setSelectedImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label={selectedImage}
        >
          <div
            style={styles.lightboxContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.lightboxHeader}>
              <span style={styles.lightboxTitle}>{selectedImage}</span>
              <button
                type="button"
                className="ghost-button"
                style={styles.lightboxCloseBtn}
                onClick={() => setSelectedImage(null)}
              >
                ✕
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={jobImageUrl(jobId, selectedImage)}
              alt={selectedImage}
              style={styles.lightboxImg}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// サブコンポーネント
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div style={styles.metricCard}>
      <span style={styles.metricLabel}>{label}</span>
      <span
        style={{
          ...styles.metricValue,
          ...(highlight ? styles.metricValueHighlight : {}),
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recharts Tooltip スタイル
// ---------------------------------------------------------------------------

const tooltipStyle: React.CSSProperties = {
  background: "rgba(10,14,24,0.92)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "8px",
  fontSize: "11px",
  color: "rgba(237,241,250,0.9)",
};

// ---------------------------------------------------------------------------
// インラインスタイル
// ---------------------------------------------------------------------------

const styles = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
    padding: "1rem",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(10,14,24,0.55)",
    backdropFilter: "blur(18px)",
    color: "rgba(237,241,250,0.9)",
  },
  loadingMessage: {
    textAlign: "center" as const,
    color: "rgba(237,241,250,0.5)",
    fontSize: "0.85rem",
    padding: "2rem 0",
  },
  emptyMessage: {
    textAlign: "center" as const,
    color: "rgba(237,241,250,0.45)",
    fontSize: "0.85rem",
    lineHeight: 1.8,
    padding: "2rem 0",
  },
  errorBanner: {
    padding: "0.5rem 0.75rem",
    background: "rgba(255,107,107,0.12)",
    border: "1px solid rgba(255,107,107,0.35)",
    borderRadius: "8px",
    color: "#ff6b6b",
    fontSize: "0.82rem",
  },
  retryBtn: {
    alignSelf: "flex-start" as const,
    padding: "0.3rem 0.8rem",
    fontSize: "0.78rem",
    borderRadius: "8px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap" as const,
    gap: "0.5rem",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flexWrap: "wrap" as const,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  title: {
    fontWeight: 700,
    fontSize: "0.95rem",
    color: "#f5f7fb",
  },
  jobIdBadge: {
    fontSize: "0.7rem",
    color: "rgba(237,241,250,0.45)",
    fontFamily: "'JetBrains Mono','Consolas',monospace",
    padding: "0.15rem 0.4rem",
    background: "rgba(255,255,255,0.06)",
    borderRadius: "6px",
    cursor: "default",
  },
  epochBadge: {
    fontSize: "0.7rem",
    color: "rgba(237,241,250,0.5)",
    padding: "0.15rem 0.4rem",
    background: "rgba(255,255,255,0.06)",
    borderRadius: "6px",
  },
  downloadLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.3rem 0.75rem",
    fontSize: "0.78rem",
    fontWeight: 600,
    color: "#a78bfa",
    border: "1px solid rgba(167,139,250,0.35)",
    borderRadius: "8px",
    background: "rgba(167,139,250,0.08)",
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 0.15s",
  } as React.CSSProperties,
  closeBtn: {
    padding: "0.25rem 0.6rem",
    fontSize: "0.78rem",
    borderRadius: "8px",
  },
  metricsSummary: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.5rem",
  },
  metricCard: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.2rem",
    padding: "0.5rem 0.75rem",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "10px",
    minWidth: "100px",
  },
  metricLabel: {
    fontSize: "0.65rem",
    color: "rgba(237,241,250,0.45)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  metricValue: {
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "#f5f7fb",
    fontFamily: "'JetBrains Mono','Consolas',monospace",
  },
  metricValueHighlight: {
    color: "#a78bfa",
  },
  chartsArea: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "0.75rem",
  },
  chartCard: {
    padding: "0.75rem",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "12px",
  },
  chartTitle: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "rgba(237,241,250,0.6)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.07em",
    marginBottom: "0.5rem",
  },
  imagesSection: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
  },
  sectionTitle: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "rgba(237,241,250,0.55)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.07em",
  },
  imageGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: "0.5rem",
  },
  imageThumbnailBtn: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.25rem",
    padding: "0.4rem",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "border-color 0.15s, background 0.15s",
  } as React.CSSProperties,
  thumbnailImg: {
    width: "100%",
    height: "120px",
    objectFit: "contain" as const,
    borderRadius: "6px",
    background: "rgba(0,0,0,0.35)",
  },
  imageLabel: {
    fontSize: "0.65rem",
    color: "rgba(237,241,250,0.45)",
    fontFamily: "'JetBrains Mono','Consolas',monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  footerRow: {
    display: "flex",
    justifyContent: "flex-end",
  },
  reloadBtn: {
    padding: "0.25rem 0.75rem",
    fontSize: "0.75rem",
    borderRadius: "8px",
  },
  // ライトボックス
  lightboxOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.82)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  lightboxContent: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
    maxWidth: "min(860px, 92vw)",
    maxHeight: "90vh",
    background: "rgba(10,14,24,0.95)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "14px",
    padding: "0.75rem",
    overflow: "auto",
  },
  lightboxHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
  },
  lightboxTitle: {
    fontSize: "0.8rem",
    color: "rgba(237,241,250,0.65)",
    fontFamily: "'JetBrains Mono','Consolas',monospace",
  },
  lightboxCloseBtn: {
    padding: "0.2rem 0.55rem",
    fontSize: "0.75rem",
    borderRadius: "6px",
    flexShrink: 0,
  },
  lightboxImg: {
    width: "100%",
    height: "auto",
    borderRadius: "8px",
    objectFit: "contain" as const,
    maxHeight: "80vh",
  },
} as const;
