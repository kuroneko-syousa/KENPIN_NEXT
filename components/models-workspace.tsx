/**
 * モデル管理ページ
 *
 * 学習完了済みジョブを「モデル」として一覧表示します。
 * データは GET /jobs から取得し、completed ステータスのみを表示します。
 */
"use client";

import { useState, useEffect, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type JobStatus = "queued" | "running" | "completed" | "failed";

interface TrainedModel {
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
          <p className="muted">
            完了した学習ジョブの重みファイルと学習パラメータを確認できます。
          </p>
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
                  <strong>{m.model.toUpperCase()}</strong>
                  <span className="model-selection-dataset">{m.dataset_id}</span>
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
                    <h3>{selected.model.toUpperCase()}</h3>
                  </div>
                  <span className="status ready">completed</span>
                </div>

                <div className="model-quick-metrics">
                  <span className="metric-chip">YOLO {selected.yolo_version}</span>
                  <span className="metric-chip">Epoch {selected.epochs}</span>
                  <span className="metric-chip">img {selected.imgsz}px</span>
                  <span className="metric-chip">batch {selected.batch}</span>
                  <span className="metric-chip">progress {selected.progress}%</span>
                </div>

                <dl className="model-detail-grid">
                  <div className="model-detail-item">
                    <dt>ジョブID</dt>
                    <dd className="mono">{selected.job_id}</dd>
                  </div>
                  <div className="model-detail-item">
                    <dt>YOLOバージョン</dt>
                    <dd>{selected.yolo_version}</dd>
                  </div>
                  <div className="model-detail-item">
                    <dt>データセット</dt>
                    <dd>{selected.dataset_id}</dd>
                  </div>
                  <div className="model-detail-item">
                    <dt>作成日時</dt>
                    <dd>{formatDate(selected.created_at)}</dd>
                  </div>
                  <div className="model-detail-item">
                    <dt>エポック数</dt>
                    <dd>{selected.epochs}</dd>
                  </div>
                  <div className="model-detail-item">
                    <dt>画像サイズ</dt>
                    <dd>{selected.imgsz} px</dd>
                  </div>
                  <div className="model-detail-item">
                    <dt>バッチサイズ</dt>
                    <dd>{selected.batch}</dd>
                  </div>
                  <div className="model-detail-item">
                    <dt>オプティマイザ</dt>
                    <dd>{selected.optimizer}</dd>
                  </div>
                  <div className="model-detail-item">
                    <dt>初期学習率 (lr0)</dt>
                    <dd>{selected.lr0}</dd>
                  </div>
                  <div className="model-detail-item">
                    <dt>最終学習率 (lrf)</dt>
                    <dd>{selected.lrf}</dd>
                  </div>
                  <div className="model-detail-item">
                    <dt>デバイス</dt>
                    <dd>{selected.device}</dd>
                  </div>
                  <div className="model-detail-item">
                    <dt>進捗</dt>
                    <dd>{selected.progress}%</dd>
                  </div>
                  <div className="model-detail-item full-span">
                    <dt>重みファイル</dt>
                    <dd className="mono">{selected.results_path ?? "best.pt の場所をサーバーで探索します"}</dd>
                  </div>
                </dl>

                <div className="form-actions model-detail-actions">
                  <button type="button" className="ghost-button" onClick={handleDownloadWeights} disabled={downloading}>
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
