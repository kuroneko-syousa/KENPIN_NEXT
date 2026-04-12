"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchJobDetail,
  fetchJobLogs,
  stopJob,
  type JobDetail,
  type JobStatus,
} from "@/lib/jobApi";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_TAIL_LINES = 500;
const TERMINAL_STATUSES: JobStatus[] = ["completed", "failed", "stopped"];

type EpochData = {
  epoch: number;
  total_epoch: number;
  box_loss: number;
  cls_loss: number;
  dfl_loss: number;
  map50: number;
  map: number;
  precision: number;
  recall: number;
  lr: number;
};

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  stopped: "Stopped",
};

const STATUS_CLASS: Record<JobStatus, string> = {
  queued: "status draft",
  running: "status training",
  completed: "status ready",
  failed: "status error",
  stopped: "status error",
};

export interface JobLogViewerProps {
  jobId: string;
  pollIntervalMs?: number;
  tailLines?: number;
  onCompleted?: (detail: JobDetail) => void;
  onFailed?: (detail: JobDetail) => void;
}

function sanitizeLine(rawLine: string): string {
  return rawLine
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\r/g, "")
    .replace(/[^\x20-\x7E\n]/g, "")
    .trim();
}

function processTerminalOutput(raw: string): string[] {
  return raw
    .split("\n")
    .map(sanitizeLine)
    .filter(Boolean);
}

export default function JobLogViewer({
  jobId,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  tailLines = DEFAULT_TAIL_LINES,
  onCompleted,
  onFailed,
}: JobLogViewerProps) {
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [logText, setLogText] = useState("");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [isStopping, setIsStopping] = useState(false);
  const [epochHistory, setEpochHistory] = useState<EpochData[]>([]);

  const logBoxRef = useRef<HTMLDivElement>(null);
  const onCompletedRef = useRef(onCompleted);
  const onFailedRef = useRef(onFailed);

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);
  useEffect(() => {
    onFailedRef.current = onFailed;
  }, [onFailed]);

  useEffect(() => {
    if (!logText) return;

    const newData: EpochData[] = [];
    for (const rawLine of logText.split("\n")) {
      const line = sanitizeLine(rawLine);
      if (!line.startsWith("JSON_LOG:")) continue;
      try {
        const data = JSON.parse(line.slice("JSON_LOG:".length)) as EpochData;
        if (typeof data.epoch === "number") {
          newData.push(data);
        }
      } catch {
        // ignore
      }
    }

    if (newData.length > 0) {
      setEpochHistory((prev) => {
        const merged = [...prev, ...newData];
        const unique = merged.filter(
          (v, i, arr) => arr.findIndex((x) => x.epoch === v.epoch) === i
        );
        return unique.sort((a, b) => a.epoch - b.epoch);
      });
    }
  }, [logText]);

  useEffect(() => {
    const el = logBoxRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (isAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logText]);

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
        setIsStopping(false);
        if (nextDetail.status === "completed") {
          onCompletedRef.current?.(nextDetail);
        } else {
          onFailedRef.current?.(nextDetail);
        }
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch job state.");
    }
  }, [jobId, tailLines]);

  useEffect(() => {
    if (!jobId) return;
    void poll();
    if (!isPolling) return;
    const timerId = setInterval(() => {
      void poll();
    }, pollIntervalMs);
    return () => clearInterval(timerId);
  }, [jobId, isPolling, poll, pollIntervalMs]);

  const handleResumePoll = () => {
    setIsPolling(true);
    void poll();
  };

  const handleStop = async () => {
    if (!detail || detail.status !== "running") return;
    setIsStopping(true);
    try {
      await stopJob(jobId);
      setIsPolling(true);
      await poll();
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to stop job.");
    } finally {
      setIsStopping(false);
    }
  };

  const logLines = useMemo(() => {
    return processTerminalOutput(logText)
      .filter((line) => {
        const l = line.trim();
        if (!l) return false;
        if (l.startsWith("JSON_LOG:")) return false;
        if (l.includes("%") && l.includes("/")) return false;
        return (
          l.includes("[Epoch") ||
          l.includes("Epoch ") ||
          l.includes("[INFO]") ||
          l.includes("ERROR") ||
          l.includes("WARNING")
        );
      })
      .slice(-200);
  }, [logText]);

  const lastEpoch = epochHistory.at(-1)?.epoch;

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>Training Monitor</span>
          <span style={styles.jobIdBadge}>{jobId.slice(0, 8)}...</span>
        </div>
        <div style={styles.headerRight}>
          {detail && <span className={STATUS_CLASS[detail.status]}>{STATUS_LABEL[detail.status]}</span>}
          <button
            type="button"
            className="ghost-button"
            style={styles.stopBtn}
            onClick={handleStop}
            disabled={!detail || detail.status !== "running" || isStopping}
          >
            {isStopping ? "Stopping..." : "Stop"}
          </button>
          {!isPolling && !TERMINAL_STATUSES.includes(detail?.status ?? "queued") && (
            <button type="button" className="ghost-button" style={styles.resumeBtn} onClick={handleResumePoll}>
              Resume
            </button>
          )}
        </div>
      </div>

      {fetchError && <div style={styles.errorBanner}>{fetchError}</div>}
      {detail?.status === "stopped" && (
        <div style={styles.stopBanner}>
          Training stopped{typeof lastEpoch === "number" ? ` (Epoch ${lastEpoch})` : ""}.
        </div>
      )}

      {detail && (
        <div style={styles.progressSection}>
          <div style={styles.progressLabelRow}>
            <span style={styles.progressLabel}>Progress</span>
            <span style={styles.progressPct}>{detail.progress}%</span>
          </div>
          <div className="progress-bar large">
            <div style={{ width: `${detail.progress}%`, transition: "width 0.4s ease" }} />
          </div>
        </div>
      )}

      {epochHistory.length > 0 && <TrainingCharts data={epochHistory} />}

      <div style={styles.logSection}>
        <div style={styles.logHeader}>
          <span style={styles.logLabel}>Logs ({logLines.length})</span>
          {logLines.length > 0 && (
            <button
              type="button"
              className="ghost-button"
              style={styles.copyBtn}
              onClick={() => navigator.clipboard.writeText(logLines.join("\n")).catch(() => {})}
            >
              Copy
            </button>
          )}
        </div>
        <div ref={logBoxRef} style={styles.logBox}>
          {logLines.length === 0 ? (
            <span style={styles.logEmpty}>Waiting for logs...</span>
          ) : (
            logLines.map((line, i) => <LogLine key={`${i}-${line}`} line={line} />)
          )}
        </div>
      </div>
    </div>
  );
}

function LogLine({ line }: { line: string }) {
  let color = "rgba(237,241,250,0.72)";
  if (/\berror\b|failed|traceback/i.test(line)) color = "#ff6b6b";
  else if (/\bwarn(ing)?\b/i.test(line)) color = "#ffc87a";
  else if (/^\[Epoch\s+\d+\/\d+\]/i.test(line) || /Epoch\s+\d+\/\d+/i.test(line)) color = "#7dd3fc";
  else if (/\[INFO\]/.test(line)) color = "rgba(237,241,250,0.55)";
  return <div style={{ color, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{line}</div>;
}

function TrainingCharts({ data }: { data: EpochData[] }) {
  const last = data[data.length - 1];
  return (
    <div style={chartStyles.wrapper}>
      <div style={chartStyles.header}>
        <span style={chartStyles.title}>Training Curves</span>
        <span style={chartStyles.epochBadge}>
          Epoch {last.epoch} / {last.total_epoch}
        </span>
      </div>
      <div style={chartStyles.grid}>
        <div style={chartStyles.card}>
          <div style={chartStyles.cardTitle}>Loss</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
              <XAxis dataKey="epoch" stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 9 }} />
              <YAxis stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 9 }} width={46} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
              <Line type="monotone" dataKey="box_loss" stroke="#fbbf24" dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="cls_loss" stroke="#f87171" dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="dfl_loss" stroke="#c084fc" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={chartStyles.card}>
          <div style={chartStyles.cardTitle}>mAP</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
              <XAxis dataKey="epoch" stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 9 }} />
              <YAxis stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 9 }} width={46} domain={[0, 1]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
              <Line type="monotone" dataKey="map50" stroke="#34d399" dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="map" stroke="#6ee7b7" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={chartStyles.card}>
          <div style={chartStyles.cardTitle}>Precision / Recall</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
              <XAxis dataKey="epoch" stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 9 }} />
              <YAxis stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 9 }} width={46} domain={[0, 1]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
              <Line type="monotone" dataKey="precision" stroke="#60a5fa" dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="recall" stroke="#f472b6" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

const chartStyles = {
  wrapper: {
    background: "rgba(0,0,0,0.22)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    padding: "0.75rem",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.6rem",
  },
  title: {
    fontSize: "0.8rem",
    fontWeight: 600 as const,
    color: "rgba(237,241,250,0.75)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.07em",
  },
  epochBadge: {
    fontSize: "0.7rem",
    color: "rgba(237,241,250,0.5)",
    background: "rgba(255,255,255,0.07)",
    padding: "0.15rem 0.5rem",
    borderRadius: "6px",
    fontFamily: "'JetBrains Mono','Consolas',monospace",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "0.6rem",
  },
  card: {
    background: "rgba(0,0,0,0.28)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "8px",
    padding: "0.5rem 0.5rem 0.25rem",
  },
  cardTitle: {
    fontSize: "0.68rem",
    color: "rgba(237,241,250,0.5)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: "0.2rem",
  },
} as const;

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
  },
  stopBtn: {
    padding: "0.25rem 0.65rem",
    fontSize: "0.75rem",
    borderRadius: "8px",
  },
  resumeBtn: {
    padding: "0.25rem 0.65rem",
    fontSize: "0.75rem",
    borderRadius: "8px",
  },
  errorBanner: {
    padding: "0.5rem 0.75rem",
    background: "rgba(255,107,107,0.12)",
    border: "1px solid rgba(255,107,107,0.35)",
    borderRadius: "8px",
    color: "#ff6b6b",
    fontSize: "0.82rem",
  },
  stopBanner: {
    padding: "0.5rem 0.75rem",
    background: "rgba(255,184,107,0.12)",
    border: "1px solid rgba(255,184,107,0.35)",
    borderRadius: "8px",
    color: "#ffc87a",
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
