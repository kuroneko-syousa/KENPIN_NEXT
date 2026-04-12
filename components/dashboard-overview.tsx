"use client";

import { useEffect, useState } from "react";

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

function statusLabel(status: string): string {
  switch (status) {
    case "running":   return "実行中";
    case "completed": return "完了";
    case "failed":    return "失敗";
    case "queued":    return "待機中";
    default:          return status;
  }
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── ローディングスケルトン ────────────────────────────────────────────────

function SkeletonChip() {
  return (
    <div
      className="overview-stat-chip"
      style={{ opacity: 0.4 }}
      aria-hidden="true"
    >
      <span style={{ background: "rgba(255,255,255,0.15)", borderRadius: 4, display: "block", height: "0.9rem", width: "5rem" }} />
      <strong style={{ background: "rgba(255,255,255,0.2)", borderRadius: 4, display: "block", height: "1.4rem", width: "2rem" }} />
    </div>
  );
}

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
          <p className="eyebrow">集計</p>
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
          throw new Error(`サーバーエラー: ${res.status} ${res.statusText}`);
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
              : "ダッシュボードデータの取得に失敗しました"
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

  const dateStr = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="workspace-content">
      {/* ─── グリーティングヒーロー ─── */}
      <section className="overview-hero panel">
        <div className="overview-greeting">
          <p className="eyebrow">ダッシュボード · {dateStr}</p>
          <h2>おかえり、{userName} さん</h2>
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

        <div className="overview-stats">
          {loading ? (
            <>
              <SkeletonChip />
              <SkeletonChip />
              <SkeletonChip />
              <SkeletonChip />
            </>
          ) : error ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              統計の読み込みに失敗しました
            </p>
          ) : summary ? (
            <>
              <div className="overview-stat-chip">
                <span>実行中ジョブ</span>
                <strong>{summary.jobs.running}</strong>
              </div>
              <div className="overview-stat-chip">
                <span>待機中ジョブ</span>
                <strong>{summary.jobs.queued}</strong>
              </div>
              <div className="overview-stat-chip">
                <span>データセット件数</span>
                <strong>{summary.datasets.total}</strong>
              </div>
              <div className="overview-stat-chip">
                <span>作成ワークスペース</span>
                <strong>{workspaceStats.own}</strong>
              </div>
            </>
          ) : null}
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
            データの取得に失敗しました
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
            <article className="panel"><div className="metric-stack overview-card-stack">{loading ? <SkeletonCard /> : <p className="muted">取得できませんでした</p>}</div></article>
            <article className="panel"><div className="metric-stack overview-card-stack">{loading ? <SkeletonCard /> : <p className="muted">取得できませんでした</p>}</div></article>
            <article className="panel"><div className="metric-stack overview-card-stack">{loading ? <SkeletonCard /> : <p className="muted">取得できませんでした</p>}</div></article>
            <article className="panel"><div className="metric-stack overview-card-stack">{loading ? <SkeletonCard /> : <p className="muted">取得できませんでした</p>}</div></article>
          </>
        ) : (
          <>
            <DonutChart
              title="ユーザー作成ワークスペース"
              centerLabel="作成数"
              centerValue={workspaceStats.own}
              segments={
                workspaceStats.ownByGenre.length > 0
                  ? workspaceStats.ownByGenre.map((genre, index) => ({
                      label: genre.label,
                      value: genre.value,
                      color: ["#66d8ff", "#7cf0ba", "#ffc57c", "#a9b8ff", "#ff9bb4", "#58d2ff"][index % 6],
                    }))
                  : [{ label: "未作成", value: 0, color: "#95a7d3" }]
              }
            />

            <DonutChart
              title="データセット件数"
              centerLabel="登録数"
              centerValue={summary.datasets.total}
              segments={[
                { label: "登録済み", value: summary.datasets.total, color: "#7cb4f0" },
              ]}
            />

            <DonutChart
              title="ジョブ集計"
              centerLabel="合計"
              centerValue={summary.jobs.total}
              segments={[
                { label: "実行中", value: summary.jobs.running, color: "#58d2ff" },
                { label: "完了", value: summary.jobs.completed, color: "#67e1a1" },
                { label: "待機中", value: summary.jobs.queued, color: "#ffc57c" },
                { label: "失敗", value: summary.jobs.failed, color: "#ff8f93" },
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

      {/* ─── 実行中ジョブ ─── */}
      <section className="detail-grid single-column">
        <article className="panel overview-running-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">優先表示</p>
              <h3>実行中ジョブ</h3>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              {!loading && summary && (
                <span className="status training">{summary.jobs.running} 件</span>
              )}
              {!loading && summary && (
                <span className="status draft">待機中 {summary.jobs.queued} 件</span>
              )}
            </div>
          </div>

          <div className="metric-stack overview-card-stack">
            {loading ? (
              <SkeletonCard />
            ) : error ? (
              <p className="muted">取得できませんでした</p>
            ) : summary && summary.jobs.running > 0 ? (
              <>
                {summary.recent_jobs
                  .filter((job) => job.status === "running")
                  .slice(0, 3)
                  .map((job) => (
                    <div key={job.job_id} className="job-card compact">
                      <div className="job-header">
                        <strong>{job.name}</strong>
                        <span className="status training">実行中</span>
                      </div>
                      <div className="progress-bar large" style={{ marginTop: "0.65rem" }}>
                        <div style={{ width: `${job.progress}%`, transition: "width 0.6s ease" }} />
                      </div>
                      <div className="job-footer">
                        <span>{job.progress}%</span>
                        <span className="muted">{formatDate(job.created_at)}</span>
                      </div>
                    </div>
                  ))}
              </>
            ) : (
              <p className="muted">実行中ジョブはありません</p>
            )}
          </div>
        </article>
      </section>

      {/* ─── アノテーション進捗 ─── */}
      <section className="detail-grid single-column">
        <article className="panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">進捗</p>
              <h3>要アノテーション完了率</h3>
            </div>
          </div>
          <div className="metric-stack overview-card-stack">
            {annotationProgress.length === 0 ? (
              <p className="muted">表示可能なアノテーション進捗データがありません</p>
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
                      <span>{dataset.completionRate}% 完了</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>
      </section>

      {/* ─── 最近のジョブ一覧 ─── */}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">履歴</p>
            <h3>最近のジョブ</h3>
          </div>
          {!loading && summary && (
            <span className="muted">直近 {summary.recent_jobs.length} 件</span>
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
            <p className="muted">取得できませんでした</p>
          ) : summary && summary.recent_jobs.length === 0 ? (
            <p className="muted">ジョブの記録がありません</p>
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
                    {statusLabel(job.status)}
                  </span>
                </div>

                {job.status === "running" && (
                  <>
                    <div className="progress-bar large" style={{ marginTop: "0.75rem" }}>
                      <div style={{ width: `${job.progress}%` }} />
                    </div>
                    <div className="job-footer">
                      <span>{job.progress}% 完了</span>
                    </div>
                  </>
                )}

                <p
                  className="muted"
                  style={{ marginTop: "0.4rem", marginBottom: 0, fontSize: "0.78rem" }}
                >
                  {formatDate(job.created_at)}
                </p>
              </div>
            ))
          ) : null}
        </div>
      </section>
    </div>
  );
}
