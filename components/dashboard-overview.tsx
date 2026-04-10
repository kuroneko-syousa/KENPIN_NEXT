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
  recent_jobs: RecentJob[];
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
};

// ─── コンポーネント ────────────────────────────────────────────────────────

export function DashboardOverview({ userName, userEmail, userRole }: Props) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSummary() {
      setLoading(true);
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
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSummary();
    return () => {
      cancelled = true;
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
                <span>完了ジョブ</span>
                <strong>{summary.jobs.completed}</strong>
              </div>
              <div className="overview-stat-chip">
                <span>データセット</span>
                <strong>{summary.datasets.total}</strong>
              </div>
              <div className="overview-stat-chip">
                <span>失敗ジョブ</span>
                <strong>{summary.jobs.failed}</strong>
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

      {/* ─── ジョブ集計 ＋ データセット ─── */}
      <section className="detail-grid">
        {/* ジョブ集計 */}
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ジョブ</p>
              <h3>ジョブ集計</h3>
            </div>
            {!loading && summary && summary.jobs.queued > 0 && (
              <span className="status draft">
                {summary.jobs.queued} 待機中
              </span>
            )}
          </div>

          <div className="metric-stack overview-card-stack">
            {loading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : error ? (
              <p className="muted">取得できませんでした</p>
            ) : summary ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {[
                  { label: "実行中",  value: summary.jobs.running,   cls: "training" },
                  { label: "完了",    value: summary.jobs.completed, cls: "ready"    },
                  { label: "待機中",  value: summary.jobs.queued,    cls: "draft"    },
                  { label: "失敗",    value: summary.jobs.failed,    cls: "error"    },
                  { label: "合計",    value: summary.jobs.total,     cls: ""         },
                ].map(({ label, value, cls }) => (
                  <div
                    key={label}
                    className="summary-item"
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <span>{label}</span>
                    <span className={cls ? `status ${cls}` : undefined} style={!cls ? { fontWeight: 700 } : undefined}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </article>

        {/* データセット */}
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">データ</p>
              <h3>データセット</h3>
            </div>
            {!loading && summary && (
              <span className="muted">{summary.datasets.total} 件</span>
            )}
          </div>

          <div className="metric-stack overview-card-stack">
            {loading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : error ? (
              <p className="muted">取得できませんでした</p>
            ) : summary ? (
              <div
                className="summary-item"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span>登録済みデータセット</span>
                <strong style={{ fontSize: "2rem", lineHeight: 1 }}>
                  {summary.datasets.total}
                </strong>
              </div>
            ) : null}
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
