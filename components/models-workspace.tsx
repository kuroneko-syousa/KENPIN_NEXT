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

  return (
    <div className="workspace-content">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">Models</p>
          <h2>学習済みモデル</h2>
          <p className="muted">
            完了した学習ジョブの重みファイルと学習パラメータを確認できます。
          </p>
        </div>
        <button type="button" onClick={fetchModels} disabled={loading}>
          {loading ? "読み込み中…" : "再読み込み"}
        </button>
      </section>

      {loading && models.length === 0 && (
        <div className="panel" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
          読み込み中…
        </div>
      )}

      {error && (
        <div className="panel" style={{ color: "#f06060", padding: "1rem" }}>
          エラー: {error}
        </div>
      )}

      {!loading && !error && models.length === 0 && (
        <div className="panel" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
          完了済みモデルが見つかりません。学習ジョブを実行してください。
        </div>
      )}

      {models.length > 0 && (
        <section className="detail-grid">
          {/* 左パネル: モデル一覧 */}
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Registry</p>
                <h3>モデル一覧</h3>
              </div>
              <span className="muted">{models.length} 件</span>
            </div>
            <div className="selection-list">
              {models.map((m) => (
                <button
                  key={m.job_id}
                  type="button"
                  className={selectedId === m.job_id ? "selection-card active" : "selection-card"}
                  onClick={() => setSelectedId(m.job_id)}
                >
                  <strong>{m.model.toUpperCase()}</strong>
                  <span>{m.dataset_id}</span>
                  <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>{formatDate(m.created_at)}</span>
                </button>
              ))}
            </div>
          </article>

          {/* 右パネル: 詳細 */}
          <article className="panel">
            {selected ? (
              <>
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Detail</p>
                    <h3>{selected.model.toUpperCase()}</h3>
                  </div>
                  <span className="status ready">completed</span>
                </div>

                <dl className="editor-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem 1.5rem" }}>
                  <div>
                    <dt style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: "0.2rem" }}>ジョブID</dt>
                    <dd style={{ fontFamily: "monospace", fontSize: "0.82rem", wordBreak: "break-all" }}>{selected.job_id}</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: "0.2rem" }}>YOLOバージョン</dt>
                    <dd>{selected.yolo_version}</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: "0.2rem" }}>データセット</dt>
                    <dd>{selected.dataset_id}</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: "0.2rem" }}>作成日時</dt>
                    <dd>{formatDate(selected.created_at)}</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: "0.2rem" }}>エポック数</dt>
                    <dd>{selected.epochs}</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: "0.2rem" }}>画像サイズ</dt>
                    <dd>{selected.imgsz} px</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: "0.2rem" }}>バッチサイズ</dt>
                    <dd>{selected.batch}</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: "0.2rem" }}>オプティマイザ</dt>
                    <dd>{selected.optimizer}</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: "0.2rem" }}>初期学習率 (lr0)</dt>
                    <dd>{selected.lr0}</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: "0.2rem" }}>最終学習率 (lrf)</dt>
                    <dd>{selected.lrf}</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: "0.2rem" }}>デバイス</dt>
                    <dd>{selected.device}</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: "0.2rem" }}>進捗</dt>
                    <dd>{selected.progress}%</dd>
                  </div>
                  {selected.results_path && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <dt style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: "0.2rem" }}>重みファイル</dt>
                      <dd style={{ fontFamily: "monospace", fontSize: "0.8rem", wordBreak: "break-all" }}>
                        {selected.results_path}
                      </dd>
                    </div>
                  )}
                </dl>

                {selected.results_path && (
                  <div className="form-actions" style={{ marginTop: "1.5rem" }}>
                    <a
                      href={`${API_BASE}/jobs/${selected.job_id}/weights`}
                      download
                      className="button"
                    >
                      重みをダウンロード
                    </a>
                  </div>
                )}
              </>
            ) : (
              <p className="muted" style={{ padding: "2rem" }}>左のリストからモデルを選んでください</p>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
