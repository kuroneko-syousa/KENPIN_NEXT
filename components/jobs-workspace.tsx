"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT, interpolate } from "@/lib/i18n";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type JobStatus = "queued" | "running" | "completed" | "failed" | "stopped";

interface JobSummary {
  job_id: string;
  dataset_id: string;
  model: string;
  yolo_version: string;
  status: JobStatus;
  progress: number;
  created_at: string;
  logs_path: string | null;
  results_path: string | null;
  error: string | null;
  locked?: boolean;
}

const STATUS_COLORS: Record<JobStatus, string> = {
  queued: "#94a3b8",
  running: "#3b82f6",
  completed: "#22c55e",
  failed: "#ef4444",
  stopped: "#f59e0b",
};

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status, t }: { status: JobStatus; t: ReturnType<typeof useT> }) {
  const color = STATUS_COLORS[status] ?? "#a3a3a3";
  const labels: Record<JobStatus, string> = {
    queued: t.job_queued,
    running: t.job_running,
    completed: t.job_completed,
    failed: t.job_failed,
    stopped: t.job_stopped,
  };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: "0.78rem",
        fontWeight: 600,
        background: `${color}22`,
        color,
        border: `1px solid ${color}55`,
        whiteSpace: "nowrap",
      }}
    >
      {labels[status] ?? status}
    </span>
  );
}

function MetaChip({ label, color }: { label: string; color?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.2rem 0.55rem",
        borderRadius: 999,
        fontSize: "0.75rem",
        fontWeight: 700,
        background: color ? `${color}22` : "rgba(255,255,255,0.08)",
        color: color ?? "var(--muted)",
        border: `1px solid ${color ? `${color}44` : "rgba(255,255,255,0.12)"}`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export function JobsWorkspace() {
  const t = useT();
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [expandedJobIds, setExpandedJobIds] = useState<Record<string, boolean>>({});

  const {
    data: jobs = [],
    isFetching,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<JobSummary[]>({
    queryKey: ["jobs"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/jobs`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as JobSummary[];
    },
    refetchInterval: 4000,
  });

  const completedWithLogs = useMemo(
    () => jobs.filter((j) => j.status === "completed" && !!j.logs_path).length,
    [jobs]
  );

  const handleLockToggle = async (job: JobSummary) => {
    setBusyJobId(job.job_id);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/jobs/${encodeURIComponent(job.job_id)}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: !job.locked }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail ?? `HTTP ${res.status}`);
      }
      setMessage(job.locked ? t.jobs_unlocked : t.jobs_locked);
      await refetch();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t.jobs_op_fail);
    } finally {
      setBusyJobId(null);
    }
  };

  const handleDelete = async (job: JobSummary) => {
    if (!window.confirm(interpolate(t.jobs_del_confirm, { id: job.job_id }))) return;
    setBusyJobId(job.job_id);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/jobs/${encodeURIComponent(job.job_id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail ?? `HTTP ${res.status}`);
      }
      setMessage(t.jobs_deleted);
      await refetch();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t.jobs_del_fail);
    } finally {
      setBusyJobId(null);
    }
  };

  const toggleExpanded = (jobId: string) => {
    setExpandedJobIds((prev) => ({
      ...prev,
      [jobId]: !prev[jobId],
    }));
  };

  return (
    <div className="workspace-content">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">{t.jobs_eyebrow}</p>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h2 style={{ margin: 0 }}>{t.jobs_h2}</h2>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label={t.jobs_refresh_aria}
              title={isFetching ? t.refreshing : t.refresh}
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.04)",
                color: "var(--muted)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: isFetching ? "wait" : "pointer",
                fontSize: "0.9rem",
                lineHeight: 1,
              }}
            >
              ↻
            </button>
          </div>
          <p className="muted">
            {interpolate(t.jobs_with_logs, { count: completedWithLogs })}
          </p>
        </div>
      </section>

      {message && (
        <div className="panel" style={{ padding: "0.75rem 1rem", marginBottom: "0.75rem" }}>
          {message}
        </div>
      )}

      {isLoading && (
        <div className="panel" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
          {t.loading}
        </div>
      )}

      {isError && (
        <div className="panel" style={{ color: "#ef4444", padding: "1rem" }}>
          {t.error_prefix} {error instanceof Error ? error.message : t.jobs_load_fail}
        </div>
      )}

      {!isLoading && !isError && jobs.length === 0 && (
        <div className="panel" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
          {t.jobs_none}
        </div>
      )}

      {jobs.length > 0 && (
        <article
          className="panel"
          style={{ padding: "1rem", display: "grid", gap: "0.85rem" }}
        >
          {jobs.map((job) => (
            <section
              key={job.job_id}
              style={{
                display: "grid",
                gap: "0.8rem",
                padding: "0.8rem 0.95rem",
                borderRadius: 18,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <button
                type="button"
                onClick={() => toggleExpanded(job.job_id)}
                aria-expanded={!!expandedJobIds[job.job_id]}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: "0.7rem",
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  textAlign: "left",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "grid", gap: "0.28rem", minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <StatusBadge status={job.status} t={t} />
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.78rem",
                        color: "var(--muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}
                    >
                      {job.job_id}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                      color: "var(--muted)",
                      fontSize: "0.76rem",
                    }}
                  >
                    <span>{job.progress}%</span>
                    <span>・</span>
                    <span>{formatDate(job.created_at, t.date_locale)}</span>
                    {job.logs_path && <MetaChip label={t.jobs_meta_log_saved} color="#22c55e" />}
                    {job.locked && <MetaChip label={t.jobs_meta_locked} color="#f59e0b" />}
                  </div>
                </div>

                <span
                  aria-hidden="true"
                  style={{
                    color: "var(--muted)",
                    fontSize: "0.9rem",
                    transform: expandedJobIds[job.job_id] ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                >
                  ▾
                </span>
              </button>

              {expandedJobIds[job.job_id] && (
              <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "0.9rem",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "grid", gap: "0.4rem", minWidth: 0, flex: "1 1 420px" }}>
                  <div style={{ color: "var(--muted)", fontSize: "0.72rem", letterSpacing: "0.08em" }}>
                    {t.jobs_detail_id}
                  </div>
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.82rem",
                      wordBreak: "break-all",
                      lineHeight: 1.45,
                    }}
                  >
                    {job.job_id}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "0.35rem 0.8rem",
                      color: "var(--muted)",
                      fontSize: "0.79rem",
                    }}
                  >
                    <div>{t.jobs_detail_model}: {job.model || "-"}</div>
                    <div>{t.jobs_detail_dataset}: {job.dataset_id || "-"}</div>
                    <div>YOLO: {job.yolo_version || "-"}</div>
                    <div>{t.jobs_detail_created}: {formatDate(job.created_at, t.date_locale)}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: "0.4rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.75rem",
                    color: "var(--muted)",
                    fontSize: "0.8rem",
                  }}
                >
                  <span>{t.jobs_detail_progress}</span>
                  <strong style={{ color: "#f5f7fb", fontSize: "0.86rem" }}>{job.progress}%</strong>
                </div>
                <div
                  style={{
                    height: 7,
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.max(0, Math.min(100, job.progress))}%`,
                      background: STATUS_COLORS[job.status] ?? "#9ca3af",
                      transition: "width .25s ease",
                    }}
                  />
                </div>
              </div>

              {job.error && (
                <div
                  style={{
                    color: "#ffb4b4",
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.18)",
                    borderRadius: 14,
                    padding: "0.65rem 0.8rem",
                    fontSize: "0.79rem",
                    lineHeight: 1.5,
                    wordBreak: "break-word",
                  }}
                >
                  {t.jobs_detail_error}: {job.error}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ color: "var(--muted)", fontSize: "0.76rem" }}>
                  {job.locked
                    ? t.jobs_no_del_locked
                    : job.status === "running" || job.status === "queued"
                      ? t.jobs_no_del_running
                      : t.jobs_can_del}
                </div>

                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void handleLockToggle(job)}
                    disabled={busyJobId === job.job_id}
                    style={{ padding: "0.62rem 0.85rem" }}
                  >
                    {job.locked ? t.jobs_btn_unlock : t.jobs_btn_lock}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(job)}
                    disabled={
                      busyJobId === job.job_id ||
                      job.locked ||
                      job.status === "running" ||
                      job.status === "queued"
                    }
                    title={
                      job.locked
                        ? t.jobs_no_del_locked
                        : job.status === "running" || job.status === "queued"
                          ? t.jobs_no_del_running
                          : ""
                    }
                    style={{ padding: "0.62rem 0.85rem" }}
                  >
                    {t.delete}
                  </button>
                </div>
              </div>
              </>
              )}
            </section>
          ))}
        </article>
      )}
    </div>
  );
}
