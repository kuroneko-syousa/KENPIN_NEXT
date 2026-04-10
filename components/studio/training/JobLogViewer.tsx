"use client";

/**
 * JobLogViewer — 学習ログ・進捗モニタリングコンポーネント
 *
 * 機能
 *  - ステータス表示（queued / running / completed / failed）
 *  - 進捗バー + パーセント表示
 *  - ログのポーリング（デフォルト 3 秒間隔）
 *  - 自動スクロール（末尾固定）
 *  - 完了 / 失敗時にポーリング停止
 *
 * 使用例
 *  <JobLogViewer jobId="abc-123" />
 *  <JobLogViewer jobId="abc-123" pollIntervalMs={5000} tailLines={200} />
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { fetchJobDetail, fetchJobLogs, type JobDetail, type JobStatus } from "@/lib/jobApi";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** ポーリング間隔のデフォルト値（ms） */
const DEFAULT_POLL_INTERVAL_MS = 3_000;

/** デフォルトで取得するログ末尾行数 */
const DEFAULT_TAIL_LINES = 300;

/** ジョブが終了した状態（これ以上変化しない） */
const TERMINAL_STATUSES: JobStatus[] = ["completed", "failed"];

// ---------------------------------------------------------------------------
// ステータスラベル / 色マッピング
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "⏳ キュー待ち",
  running: "🚀 学習中",
  completed: "✅ 完了",
  failed: "❌ 失敗",
};

const STATUS_CLASS: Record<JobStatus, string> = {
  queued: "status draft",
  running: "status training",
  completed: "status ready",
  failed: "status error",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface JobLogViewerProps {
  /** 監視対象のジョブ ID */
  jobId: string;
  /** ポーリング間隔 (ms)。デフォルト: 3000 */
  pollIntervalMs?: number;
  /** 取得するログ末尾行数。デフォルト: 300 */
  tailLines?: number;
  /** ジョブ完了時コールバック */
  onCompleted?: (detail: JobDetail) => void;
  /** ジョブ失敗時コールバック */
  onFailed?: (detail: JobDetail) => void;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export default function JobLogViewer({
  jobId,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  tailLines = DEFAULT_TAIL_LINES,
  onCompleted,
  onFailed,
}: JobLogViewerProps) {
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [logText, setLogText] = useState<string>("");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(true);

  const logBoxRef = useRef<HTMLDivElement>(null);
  const onCompletedRef = useRef(onCompleted);
  const onFailedRef = useRef(onFailed);

  // コールバックを ref に保持してポーリングループ内で最新版を参照
  useEffect(() => { onCompletedRef.current = onCompleted; }, [onCompleted]);
  useEffect(() => { onFailedRef.current = onFailed; }, [onFailed]);

  // ログ末尾への自動スクロール
  useEffect(() => {
    const el = logBoxRef.current;
    if (!el) return;
    // ユーザーが手動スクロールしていない場合のみ末尾追従
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (isAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logText]);

  // ─── ポーリング本体 ───────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const [nextDetail, nextLog] = await Promise.all([
        fetchJobDetail(jobId),
        fetchJobLogs(jobId, tailLines),
      ]);

      setDetail(nextDetail);
      setLogText(nextLog);
      setFetchError(null);

      if (TERMINAL_STATUSES.includes(nextDetail.status)) {
        setIsPolling(false);
        if (nextDetail.status === "completed") {
          onCompletedRef.current?.(nextDetail);
        } else {
          onFailedRef.current?.(nextDetail);
        }
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "取得エラー");
    }
  }, [jobId, tailLines]);

  // ─── ポーリングループ ─────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return;

    // 初回即時取得
    poll();

    if (!isPolling) return;

    const timerId = setInterval(() => {
      poll();
    }, pollIntervalMs);

    return () => clearInterval(timerId);
  }, [jobId, isPolling, pollIntervalMs, poll]);

  // ─── 手動でポーリングを再開する ────────────────────────────────────────
  const handleResumePoll = () => {
    setIsPolling(true);
    poll();
  };

  // ─── ログ行配列 ─────────────────────────────────────────────────────
  const logLines = logText ? logText.split("\n") : [];

  // ─── 描画 ─────────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      {/* ヘッダー */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>学習モニター</span>
          <span style={styles.jobIdBadge} title={jobId}>
            {jobId.slice(0, 8)}…
          </span>
        </div>

        <div style={styles.headerRight}>
          {detail && (
            <span className={STATUS_CLASS[detail.status]}>
              {STATUS_LABEL[detail.status]}
            </span>
          )}
          {!isPolling && !TERMINAL_STATUSES.includes(detail?.status ?? "queued") && (
            <button type="button" className="ghost-button" style={styles.resumeBtn} onClick={handleResumePoll}>
              再開
            </button>
          )}
          {isPolling && (
            <span style={styles.pollingDot} title="ポーリング中" />
          )}
        </div>
      </div>

      {/* フェッチエラー */}
      {fetchError && (
        <div style={styles.errorBanner}>
          ⚠ {fetchError}
        </div>
      )}

      {/* 進捗バー */}
      {detail && (
        <div style={styles.progressSection}>
          <div style={styles.progressLabelRow}>
            <span style={styles.progressLabel}>
              進捗
            </span>
            <span style={styles.progressPct}>
              {detail.progress}%
            </span>
          </div>
          <div className="progress-bar large">
            <div style={{ width: `${detail.progress}%`, transition: "width 0.4s ease" }} />
          </div>

          {/* メトリクスサマリー */}
          <div style={styles.metaGrid}>
            <MetaItem label="モデル" value={detail.model} />
            <MetaItem label="エポック数" value={String(detail.epochs)} />
            <MetaItem label="データセット" value={detail.dataset_id} />
            {detail.error && <MetaItem label="エラー" value={detail.error} danger />}
          </div>
        </div>
      )}

      {/* ログエリア */}
      <div style={styles.logSection}>
        <div style={styles.logHeader}>
          <span style={styles.logLabel}>ログ ({logLines.length} 行)</span>
          {logLines.length > 0 && (
            <button
              type="button"
              className="ghost-button"
              style={styles.copyBtn}
              onClick={() => navigator.clipboard.writeText(logText).catch(() => {})}
            >
              コピー
            </button>
          )}
        </div>

        <div ref={logBoxRef} style={styles.logBox}>
          {logLines.length === 0 ? (
            <span style={styles.logEmpty}>
              {detail ? "ログ待機中..." : "ジョブ情報を取得中..."}
            </span>
          ) : (
            logLines.map((line, i) => (
              <LogLine key={i} line={line} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// サブコンポーネント
// ---------------------------------------------------------------------------

function MetaItem({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong style={danger ? { color: "#ff6b6b" } : undefined}>{value}</strong>
    </div>
  );
}

/** ログ行 — YOLO 出力の色分け（warn / error / epoch） */
function LogLine({ line }: { line: string }) {
  const lower = line.toLowerCase();
  let color = "rgba(237,241,250,0.72)";
  if (/\berror\b|failed|traceback/i.test(lower)) {
    color = "#ff6b6b";
  } else if (/\bwarn(ing)?\b/i.test(lower)) {
    color = "#ffc87a";
  } else if (/^.*epoch\s+\d+/i.test(line)) {
    color = "#7dd3fc";
  }
  return (
    <div style={{ color, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
      {line || "\u200b" /* ゼロ幅スペース：空行の高さを保持 */}
    </div>
  );
}

// ---------------------------------------------------------------------------
// インラインスタイル
// ---------------------------------------------------------------------------

const styles = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
    padding: "1rem",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(10,14,24,0.55)",
    backdropFilter: "blur(18px)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
    flexWrap: "wrap" as const,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
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
  resumeBtn: {
    padding: "0.25rem 0.65rem",
    fontSize: "0.75rem",
    borderRadius: "8px",
  },
  pollingDot: {
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "#4ade80",
    animation: "pulse 1.5s ease-in-out infinite",
    flexShrink: 0,
  } as React.CSSProperties,
  errorBanner: {
    padding: "0.5rem 0.75rem",
    background: "rgba(255,107,107,0.12)",
    border: "1px solid rgba(255,107,107,0.35)",
    borderRadius: "8px",
    color: "#ff6b6b",
    fontSize: "0.82rem",
  },
  progressSection: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.35rem",
  },
  progressLabelRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  progressLabel: {
    fontSize: "0.78rem",
    color: "rgba(237,241,250,0.55)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  progressPct: {
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "#f5f7fb",
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: "0.4rem",
    marginTop: "0.35rem",
  },
  logSection: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.35rem",
  },
  logHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logLabel: {
    fontSize: "0.7rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "rgba(237,241,250,0.4)",
  },
  copyBtn: {
    padding: "0.2rem 0.55rem",
    fontSize: "0.7rem",
    borderRadius: "6px",
  },
  logBox: {
    background: "rgba(0,0,0,0.38)",
    border: "1px solid rgba(237,241,250,0.08)",
    borderRadius: "8px",
    padding: "0.75rem",
    height: "260px",
    overflowY: "auto" as const,
    fontFamily: "'JetBrains Mono','Fira Code','Consolas',monospace",
    fontSize: "0.7rem",
    lineHeight: 1.65,
  },
  logEmpty: {
    color: "rgba(237,241,250,0.35)",
    fontStyle: "italic" as const,
  },
} as const;
