/**
 * モデル管理ページ
 *
 * 学習完了済みジョブを「モデル」として一覧表示します。
 * データは GET /jobs から取得し、completed ステータスのみを表示します。
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import JobResultsViewer from "@/components/studio/training/JobResultsViewer";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type JobStatus = "queued" | "running" | "completed" | "failed";

interface TrainedModel {
  job_id: string;
  workspace_id: string | null;
  dataset_id: string;
  display_name: string | null;
  model: string;
  yolo_version: string;
  status: JobStatus;
  progress: number;
  created_at: string;
  logs_path: string | null;
  results_path: string | null;
  error: string | null;
  epochs: number;
  imgsz: number;
  batch: number;
  lr0: number;
  lrf: number;
  optimizer: string;
  device: string;
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

export function ModelsWorkspace() {
  const [models, setModels] = useState<TrainedModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameMode, setRenameMode] = useState(false);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/jobs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TrainedModel[] = await res.json();
      const completed = data.filter((j) => j.status === "completed");
      setModels(completed);
      if (completed.length > 0) {
        setSelectedId((prev) => prev ?? completed[0].job_id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const selected = models.find((m) => m.job_id === selectedId) ?? null;

  useEffect(() => {
    if (!selected?.workspace_id) {
      setWorkspaceName(null);
      return;
    }
    fetch(`/api/workspaces/${selected.workspace_id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setWorkspaceName(data?.name ?? null))
      .catch(() => setWorkspaceName(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // selectedId が変わったらリネームモードをリセット
  useEffect(() => {
    setRenameMode(false);
    setRenameValue("");
    setRenameError(null);
  }, [selectedId]);

  const handleRename = useCallback(async () => {
    if (!selected || !renameValue.trim()) return;
    setRenaming(true);
    setRenameError(null);
    try {
      const res = await fetch(`${API_BASE}/jobs/${selected.job_id}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: renameValue.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // ローカルの models リストを更新
      setModels((prev) =>
        prev.map((m) =>
          m.job_id === selected.job_id ? { ...m, display_name: renameValue.trim() } : m
        )
      );
      setRenameMode(false);
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : "変更に失敗しました");
    } finally {
      setRenaming(false);
    }
  }, [selected, renameValue]);

  const handleDownloadWeights = useCallback(async () => {
    if (!selected) return;
    setDownloadError(null);
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/jobs/${selected.job_id}/weights`);
      if (!res.ok) {
        let detail = "重みファイルを取得できませんでした";
        try {
          const payload = await res.json();
          if (payload?.detail) detail = String(payload.detail);
        } catch {
          // Fallback to generic error when response body is not JSON.
        }
        throw new Error(detail);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selected.model || "model"}-${selected.job_id}-best.pt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "ダウンロードに失敗しました");
    } finally {
      setDownloading(false);
    }
  }, [selected]);

  return (
    <div className="workspace-content models-workspace">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">Models</p>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h2 style={{ margin: 0 }}>学習済みモデル</h2>
            <button
              type="button"
              onClick={fetchModels}
              disabled={loading}
              aria-label="モデル一覧を更新"
              title={loading ? "更新中..." : "更新"}
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
                cursor: loading ? "wait" : "pointer",
                fontSize: "0.9rem",
                lineHeight: 1,
              }}
            >
              ↻
            </button>
          </div>
          <p className="muted">作成したモデルの学習結果とパラメータを確認できます。</p>
        </div>
      </section>

      {loading && models.length === 0 && (
        <div className="panel model-state-panel">
          読み込み中…
        </div>
      )}

      {error && (
        <div className="panel model-state-panel model-state-error">
          エラー: {error}
        </div>
      )}

      {!loading && !error && models.length === 0 && (
        <div className="panel model-state-panel">
          完了済みモデルが見つかりません。学習ジョブを実行してください。
        </div>
      )}

      {models.length > 0 && (
        <section className="detail-grid">
          {/* 左パネル: モデル一覧 */}
          <article className="panel model-list-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Registry</p>
                <h3>モデル一覧</h3>
              </div>
              <span className="muted">{models.length} 件</span>
            </div>
            <div className="selection-list model-selection-list">
              {models.map((m) => (
                <button
                  key={m.job_id}
                  type="button"
                  className={selectedId === m.job_id ? "selection-card model-selection-card active" : "selection-card model-selection-card"}
                  onClick={() => setSelectedId(m.job_id)}
                >
                  <strong>{m.display_name || m.model.toUpperCase()}</strong>
                  <span className="model-selection-dataset">{m.model}</span>
                  <span className="model-selection-date">{formatDate(m.created_at)}</span>
                </button>
              ))}
            </div>
          </article>

          {/* 右パネル: 詳細 */}
          <article className="panel model-detail-panel">
            {selected ? (
              <>
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Detail</p>
                    {renameMode ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenameMode(false); }}
                          maxLength={200}
                          autoFocus
                          style={{
                            fontSize: "1rem",
                            fontWeight: 600,
                            padding: "0.15rem 0.4rem",
                            borderRadius: "6px",
                            border: "1px solid rgba(255,255,255,0.3)",
                            background: "rgba(255,255,255,0.08)",
                            color: "inherit",
                            outline: "none",
                            minWidth: 0,
                            flex: 1,
                          }}
                        />
                        <button
                          type="button"
                          className="ghost-button"
                          style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                          onClick={handleRename}
                          disabled={renaming || !renameValue.trim()}
                        >
                          {renaming ? "保存中…" : "保存"}
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                          onClick={() => setRenameMode(false)}
                          disabled={renaming}
                        >
                          キャンセル
                        </button>
                        {renameError && <span style={{ fontSize: "0.75rem", color: "#f87171" }}>{renameError}</span>}
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <h3 style={{ margin: 0 }}>{selected.display_name || selected.model.toUpperCase()}</h3>
                        <button
                          type="button"
                          className="ghost-button"
                          style={{ fontSize: "0.72rem", padding: "0.15rem 0.4rem", opacity: 0.7 }}
                          onClick={() => { setRenameValue(selected.display_name || ""); setRenameMode(true); }}
                          title="名前を変更"
                        >
                          ✎
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="status ready">completed</span>
                </div>

                {/* メタデータ */}
                <dl className="model-detail-grid">
                  <div className="model-detail-item">
                    <dt>ワークスペース</dt>
                    <dd>{workspaceName ?? selected.workspace_id ?? "—"}</dd>
                  </div>
                  <div className="model-detail-item">
                    <dt>モデル</dt>
                    <dd>{selected.model} (YOLO {selected.yolo_version})</dd>
                  </div>
                  <div className="model-detail-item">
                    <dt>作成日時</dt>
                    <dd>{formatDate(selected.created_at)}</dd>
                  </div>
                  <div className="model-detail-item full-span">
                    <dt>パラメーター</dt>
                    <dd>
                      <div className="model-quick-metrics" style={{ marginTop: "0.25rem" }}>
                        <span className="metric-chip">epochs: {selected.epochs}</span>
                        <span className="metric-chip">imgsz: {selected.imgsz}px</span>
                        <span className="metric-chip">batch: {selected.batch}</span>
                        <span className="metric-chip">optimizer: {selected.optimizer}</span>
                        <span className="metric-chip">lr0: {selected.lr0}</span>
                        <span className="metric-chip">lrf: {selected.lrf}</span>
                        <span className="metric-chip">device: {selected.device}</span>
                      </div>
                    </dd>
                  </div>
                </dl>

                {/* 学習進捗グラフ */}
                <JobResultsViewer jobId={selected.job_id} />

                {/* ダウンロード */}
                <div className="form-actions model-detail-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    style={{ fontSize: "0.78rem", padding: "0.25rem 0.65rem" }}
                    onClick={handleDownloadWeights}
                    disabled={downloading}
                  >
                    {downloading ? "ダウンロード中…" : "重みをダウンロード"}
                  </button>
                  {downloadError && <span className="model-download-error">{downloadError}</span>}
                </div>
              </>
            ) : (
              <p className="muted model-empty-note">左のリストからモデルを選んでください</p>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
