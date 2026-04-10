"use client";

import { useQuery } from "@tanstack/react-query";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type JobStatus = "queued" | "running" | "completed" | "failed";

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
}

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: "待機中",
  running: "実行中",
  completed: "完了",
  failed: "失敗",
};

const STATUS_COLORS: Record<JobStatus, string> = {
  queued:    "#a0aec0",
  running:   "#3b82f6",
  completed: "#22c55e",
  failed:    "#ef4444",
};

function StatusBadge({ status }: { status: JobStatus }) {
  const color = STATUS_COLORS[status] ?? "#aaa";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "12px",
        fontSize: "0.78rem",
        fontWeight: 600,
        background: color + "22",
        color,
        border: `1px solid ${color}44`,
        whiteSpace: "nowrap",
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
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

export function JobsWorkspace() {
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
      const res = await fetch(`${API_BASE}/jobs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 5000,
  });

  return (
    <div className="workspace-content">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">Jobs</p>
          <h2>ジョブ監視</h2>
          <p className="muted">
            学習ジョブの実行状況、進捗、作成日時を確認できます。
          </p>
        </div>
        <button type="button" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "読み込み中…" : "再読み込み"}
        </button>
      </section>

      {isLoading && (
        <div className="panel" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
          読み込み中…
        </div>
      )}

      {isError && (
        <div className="panel" style={{ color: "#f06060", padding: "1rem" }}>
          エラー: {error instanceof Error ? error.message : "取得に失敗しました"}
        </div>
      )}

      {!isLoading && !isError && jobs.length === 0 && (
        <div className="panel" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
          ジョブが見つかりません
        </div>
      )}

      {jobs.length > 0 && (
        <article className="panel">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", textAlign: "left" }}>
                <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600, color: "var(--muted)" }}>Job ID</th>
                <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600, color: "var(--muted)" }}>ステータス</th>
                <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600, color: "var(--muted)" }}>進捗</th>
                <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600, color: "var(--muted)" }}>作成日時</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.job_id}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    <span
                      title={job.job_id}
                      style={{ fontFamily: "monospace", fontSize: "0.82rem" }}
                    >
                      {job.job_id.slice(0, 8)}…
                    </span>
                    <span style={{ marginLeft: "0.5rem", fontSize: "0.78rem", color: "var(--muted)" }}>
                      {job.model}
                    </span>
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    <StatusBadge status={job.status} />
                    {job.error && (
                      <span
                        title={job.error}
                        style={{ marginLeft: "0.5rem", fontSize: "0.78rem", color: "#f06060" }}
                      >
                        {job.error.slice(0, 40)}{job.error.length > 40 ? "…" : ""}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem", minWidth: "160px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div
                        style={{
                          flex: 1,
                          height: "6px",
                          background: "rgba(255,255,255,0.1)",
                          borderRadius: "3px",
                          overflow: "hidden",
                          minWidth: "80px",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${job.progress}%`,
                            background: STATUS_COLORS[job.status] ?? "#aaa",
                            borderRadius: "3px",
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                      <span style={{ fontSize: "0.8rem", color: "var(--muted)", minWidth: "36px" }}>
                        {job.progress}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "var(--muted)", fontSize: "0.85rem" }}>
                    {formatDate(job.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}
    </div>
  );
}
