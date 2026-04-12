"use client";

import { useEffect, useState } from "react";
import { useT, interpolate } from "@/lib/i18n";

// ─── API レスポンス型定義 ───────────────────────────────────────────────────

type JobStats = {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
};

type DatasetStats = {
  total: number;
};

type ModelStats = {
  total: number;
};

type RecentJob = {
  job_id: string;
  name: string;
  status: string;    // "queued" | "running" | "completed" | "failed"
  progress: number;
  dataset_id: string;
  model: string;
  created_at: string; // ISO-8601 UTC
};

type DashboardSummary = {
  jobs: JobStats;
  datasets: DatasetStats;
  models: ModelStats;
  recent_jobs: RecentJob[];
};

type WorkspaceStats = {
  own: number;
  ownByGenre: {
    label: string;
    value: number;
  }[];
};

type AnnotationProgress = {
  id: string;
  name: string;
  total: number;
  annotated: number;
  completionRate: number;
};

// ─── 定数 ─────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── ヘルパー ──────────────────────────────────────────────────────────────

function statusClass(status: string): string {
  switch (status) {
    case "running":   return "training";
    case "completed": return "ready";
    case "failed":    return "error";
    case "queued":    return "draft";
    default:          return "draft";
  }
}

function statusLabel(status: string, t: ReturnType<typeof useT>): string {
  switch (status) {
    case "running":   return t.job_running;
    case "completed": return t.job_completed;
    case "failed":    return t.job_failed;
    case "queued":    return t.job_queued;
    default:          return status;
  }
}

function formatDate(isoString: string, locale: string): string {
  return new Date(isoString).toLocaleString(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── ローディングスケルトン ────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="job-card"
      style={{ opacity: 0.35 }}
      aria-hidden="true"
    >
      <div
        style={{
          background: "rgba(255,255,255,0.15)",
          borderRadius: 4,
          height: "1rem",
          width: "60%",
          marginBottom: "0.6rem",
        }}
      />
      <div className="progress-bar large">
        <div style={{ width: "40%" }} />
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────

type Props = {
  userName: string;
  userEmail: string;
  userRole: string;
  workspaceStats: WorkspaceStats;
  annotationProgress: AnnotationProgress[];
};

type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

function DonutChart({
  title,
  centerLabel,
  centerValue,
  segments,
}: {
  title: string;
  centerLabel: string;
  centerValue: number;
  segments: DonutSegment[];
}) {
  const R = 34;
  const cx = 44;
  const cy = 44;
  const circumference = 2 * Math.PI * R;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let consumed = 0;

  const arcs =
    total > 0
      ? segments
          .filter((segment) => segment.value > 0)
          .map((segment) => {
            const arcLength = (segment.value / total) * circumference;
            const dashOffset = circumference / 4 - consumed;
            consumed += arcLength;
            return {
              ...segment,
              arcLength,
              dashOffset,
            };
          })
      : [];

  return (
    <article className="panel overview-donut-card">
      <div className="panel-heading compact">
        <div>
          <h3>{title}</h3>
        </div>
      </div>

      <div className="overview-donut-layout">
        <div
          className="overview-donut"
          role="img"
          aria-label={`${title} 円グラフ`}
        >
          <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
            <circle
              cx={cx}
              cy={cy}
              r={R}
              fill="none"
              stroke="rgba(237,241,250,0.1)"
              strokeWidth="11"
            />
            {arcs.length > 0 ? (
              arcs.map((arc) => (
                <circle
                  key={arc.label}
                  cx={cx}
                  cy={cy}
                  r={R}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth="11"
                  strokeDasharray={`${arc.arcLength} ${Math.max(circumference - arc.arcLength, 0)}`}
                  strokeDashoffset={arc.dashOffset}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dasharray 0.45s cubic-bezier(.4,0,.2,1)" }}
                />
              ))
            ) : (
              <circle
                cx={cx}
                cy={cy}
                r={R}
                fill="none"
                stroke="rgba(237,241,250,0.1)"
                strokeWidth="11"
              />
            )}
            <text x={cx} y={cy - 4} textAnchor="middle" fill="#edf1fa" fontSize="13" fontWeight="700">
              {centerValue}
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(237,241,250,0.45)" fontSize="8">
              {centerLabel}
            </text>
          </svg>
        </div>

        <div className="overview-donut-legend">
          {segments.map((segment) => (
            <div key={segment.label} className="overview-donut-legend-row">
              <span className="overview-donut-dot" style={{ background: segment.color }} />
              <span>{segment.label}</span>
              <strong>{segment.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

// ─── コンポーネント ────────────────────────────────────────────────────────

export function DashboardOverview({ userName, userEmail, userRole, workspaceStats, annotationProgress: initialAnnotationProgress }: Props) {
  const t = useT();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [annotationProgress, setAnnotationProgress] = useState<AnnotationProgress[]>(initialAnnotationProgress);

  useEffect(() => {
    let cancelled = false;

    async function fetchSummary(isInitial: boolean) {
      if (isInitial) setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/dashboard/summary`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`${res.status} ${res.statusText}`);
        }
        const data: DashboardSummary = await res.json();
        if (!cancelled) {
          setSummary(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : t.overview_fetch_error
          );
        }
      } finally {
        if (isInitial && !cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSummary(true);

    // 実行中ジョブがある間は 3 秒ごとにポーリングして進捗を同期する
    const timerId = setInterval(() => {
      void fetchSummary(false);
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, []);

  // アノテーション進捗を 15 秒ごとに同期
  useEffect(() => {
    let cancelled = false;

    async function fetchAnnotationProgress() {
      try {
        const res = await fetch("/api/dashboard/annotation-progress", { cache: "no-store" });
        if (!res.ok) return;
        const data: AnnotationProgress[] = await res.json();
        if (!cancelled) setAnnotationProgress(data);
      } catch {
        // サイレントに失敗（UI に影響しない）
      }
    }

    const timerId = setInterval(() => {
      void fetchAnnotationProgress();
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, []);

  return (
    <div className="workspace-content">
      {/* ─── グリーティングヒーロー ─── */}
      <section className="overview-hero panel">
        <div className="overview-greeting">
          <h2>{interpolate(t.overview_greeting, { name: userName })}</h2>
          <p className="muted">
            {userEmail}
            {userRole && userRole !== "User" && (
              <>
                {" "}
                &nbsp;·&nbsp;{" "}
                <span className="overview-role-badge">{userRole}</span>
              </>
            )}
          </p>
        </div>
      </section>

      {/* ─── エラーバナー ─── */}
      {error && (
        <section
          className="panel"
          style={{
            borderLeft: "3px solid var(--clr-error, #ef4444)",
            padding: "0.75rem 1rem",
          }}
          role="alert"
        >
          <p style={{ margin: 0, color: "var(--clr-error, #ef4444)", fontWeight: 600 }}>
            {t.overview_fetch_error}
          </p>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            {error}
          </p>
        </section>
      )}

      {/* ─── 実行中優先表示 ─── */}
      <section className="overview-top-grid">
        {loading || error || !summary ? (
          <>
            <article className="panel"><div className="metric-stack overview-card-stack">{loading ? <SkeletonCard /> : <p className="muted">{t.overview_unavailable}</p>}</div></article>
            <article className="panel"><div className="metric-stack overview-card-stack">{loading ? <SkeletonCard /> : <p className="muted">{t.overview_unavailable}</p>}</div></article>
            <article className="panel"><div className="metric-stack overview-card-stack">{loading ? <SkeletonCard /> : <p className="muted">{t.overview_unavailable}</p>}</div></article>
            <article className="panel"><div className="metric-stack overview-card-stack">{loading ? <SkeletonCard /> : <p className="muted">{t.overview_unavailable}</p>}</div></article>
          </>
        ) : (
          <>
            <DonutChart
              title={t.overview_ws_donut}
              centerLabel={t.overview_ws_center}
              centerValue={workspaceStats.own}
              segments={
                workspaceStats.ownByGenre.length > 0
                  ? workspaceStats.ownByGenre.map((genre, index) => ({
                      label: genre.label,
                      value: genre.value,
                      color: ["#66d8ff", "#7cf0ba", "#ffc57c", "#a9b8ff", "#ff9bb4", "#58d2ff"][index % 6],
                    }))
                  : [{ label: t.overview_ws_empty, value: 0, color: "#95a7d3" }]
              }
            />

            <DonutChart
              title={t.overview_ds_donut}
              centerLabel={t.overview_ds_center}
              centerValue={summary.datasets.total}
              segments={[
                { label: t.overview_ds_legend, value: summary.datasets.total, color: "#7cb4f0" },
              ]}
            />

            <DonutChart
              title={t.overview_job_donut}
              centerLabel={t.overview_job_center}
              centerValue={summary.jobs.total}
              segments={[
                { label: t.job_running, value: summary.jobs.running, color: "#58d2ff" },
                { label: t.job_completed, value: summary.jobs.completed, color: "#67e1a1" },
                { label: t.job_queued, value: summary.jobs.queued, color: "#ffc57c" },
                { label: t.job_failed, value: summary.jobs.failed, color: "#ff8f93" },
              ]}
            />

            <DonutChart
              title="作成済みモデル"
              centerLabel="モデル数"
              centerValue={summary.models.total}
              segments={[
                { label: "作成済み", value: summary.models.total, color: "#7cf0ba" },
              ]}
            />
          </>
        )}
      </section>

      {/* ─── アノテーション進捗 + 実行中ジョブ ─── */}
      <section className="detail-grid two-column">
        <article className="panel">
          <div className="panel-heading compact">
            <div>
              <h3>{t.overview_anno_donut}</h3>
            </div>
          </div>
          <div className="metric-stack overview-card-stack">
            {annotationProgress.length === 0 ? (
              <p className="muted">{t.overview_unavailable}</p>
            ) : (
              <div className="overview-bar-list">
                {annotationProgress.map((dataset) => (
                  <div key={dataset.id} className="overview-bar-item">
                    <div className="overview-bar-label-row">
                      <span>{dataset.name}</span>
                      <span className="muted">{dataset.annotated}/{dataset.total}</span>
                    </div>
                    <div className="progress-bar large overview-annotation-bar">
                      <div style={{ width: `${dataset.completionRate}%` }} />
                    </div>
                    <div className="overview-bar-footnote">
                        <span>{dataset.completionRate}% {t.job_completed}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>

        <article className="panel overview-running-panel">
          <div className="panel-heading compact">
            <div>
              <h3>{t.job_running}</h3>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              {!loading && summary && (
                <span className="status training">{summary.jobs.running} {t.job_running}</span>
              )}
              {!loading && summary && (
                <span className="status draft">{t.job_queued} {summary.jobs.queued}</span>
              )}
            </div>
          </div>

          <div className="metric-stack overview-card-stack">
            {loading ? (
              <SkeletonCard />
            ) : error ? (
              <p className="muted">{t.overview_unavailable}</p>
            ) : summary && summary.jobs.running > 0 ? (
              <>
                {summary.recent_jobs
                  .filter((job) => job.status === "running")
                  .slice(0, 3)
                  .map((job) => (
                    <div key={job.job_id} className="job-card compact">
                      <div className="job-header">
                        <strong>{job.name}</strong>
                        <span className="status training">{t.job_running}</span>
                      </div>
                      <div className="progress-bar large" style={{ marginTop: "0.65rem" }}>
                        <div style={{ width: `${job.progress}%`, transition: "width 0.6s ease" }} />
                      </div>
                      <div className="job-footer">
                        <span>{job.progress}%</span>
                        <span className="muted">{formatDate(job.created_at, t.date_locale)}</span>
                      </div>
                    </div>
                  ))}
              </>
            ) : (
              <p className="muted">{t.overview_unavailable}</p>
            )}
          </div>
        </article>
      </section>

      {/* ─── 最近のジョブ一覧 ─── */}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>{t.job_completed}</h3>
          </div>
          {!loading && summary && (
            <span className="muted">{summary.recent_jobs.length}</span>
          )}
        </div>

        <div className="metric-stack overview-card-stack">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : error ? (
            <p className="muted">{t.overview_unavailable}</p>
          ) : summary && summary.recent_jobs.length === 0 ? (
            <p className="muted">{t.overview_unavailable}</p>
          ) : summary ? (
            summary.recent_jobs.map((job) => (
              <div key={job.job_id} className="job-card">
                <div className="job-header">
                  <div>
                    <strong>{job.name}</strong>
                    <p
                      className="muted"
                      style={{ margin: "0.2rem 0 0", fontSize: "0.8rem" }}
                    >
                      {job.model} &nbsp;·&nbsp; DS: {job.dataset_id}
                    </p>
                  </div>
                  <span className={`status ${statusClass(job.status)}`}>
                    {statusLabel(job.status, t)}
                  </span>
                </div>

                {job.status === "running" && (
                  <>
                    <div className="progress-bar large" style={{ marginTop: "0.75rem" }}>
                      <div style={{ width: `${job.progress}%` }} />
                    </div>
                    <div className="job-footer">
                      <span>{job.progress}% {t.job_completed}</span>
                    </div>
                  </>
                )}

                <p
                  className="muted"
                  style={{ marginTop: "0.4rem", marginBottom: 0, fontSize: "0.78rem" }}
                >
                  {formatDate(job.created_at, t.date_locale)}
                </p>
              </div>
            ))
          ) : null}
        </div>
      </section>
    </div>
  );
}
