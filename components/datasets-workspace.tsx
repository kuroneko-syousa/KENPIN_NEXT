"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface DatasetInfo {
  dataset_id: string;
  image_count: number;
  classes: string[];
  created_at: string;
  data_yaml: string | null;
  path: string;
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

export function DatasetsWorkspace() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {
    data: datasets = [],
    isFetching,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<DatasetInfo[]>({
    queryKey: ["datasets"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/datasets`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DatasetInfo[] = await res.json();
      if (data.length > 0) setSelectedId((prev) => prev ?? data[0].dataset_id);
      return data;
    },
  });

  const selectedDataset = datasets.find((d) => d.dataset_id === selectedId) ?? null;

  return (
    <div className="workspace-content">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">Datasets</p>
          <h2>データセット管理</h2>
          <p className="muted">
            登録済みデータセットの画像数・クラス情報を確認できます。
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
        <div className="panel" style={{ color: "#ef4444", padding: "1rem" }}>
          エラー: {error instanceof Error ? error.message : "取得に失敗しました"}
        </div>
      )}

      {!isLoading && !isError && datasets.length === 0 && (
        <div className="panel" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
          データセットが見つかりません
        </div>
      )}

      {datasets.length > 0 && (
        <section className="detail-grid">
          <article className="panel">
            <div className="selection-list">
              {datasets.map((ds) => (
                <button
                  key={ds.dataset_id}
                  type="button"
                  className={
                    selectedId === ds.dataset_id
                      ? "selection-card workspace-selection-card active"
                      : "selection-card workspace-selection-card"
                  }
                  onClick={() => setSelectedId(ds.dataset_id)}
                >
                  <strong style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>
                    {ds.dataset_id}
                  </strong>
                  <span>
                    {ds.image_count.toLocaleString()} 枚 · {ds.classes.length} クラス
                  </span>
                </button>
              ))}
            </div>
          </article>

          <article className="panel">
            {selectedDataset ? (
              <>
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Dataset Detail</p>
                    <h3 style={{ fontFamily: "monospace", fontSize: "1rem", wordBreak: "break-all" }}>
                      {selectedDataset.dataset_id}
                    </h3>
                  </div>
                </div>

                <dl
                  style={{
                    display: "grid",
                    gridTemplateColumns: "max-content 1fr",
                    gap: "0.5rem 1.5rem",
                    fontSize: "0.9rem",
                    margin: "1rem 0",
                  }}
                >
                  <dt style={{ color: "var(--muted)" }}>画像数</dt>
                  <dd style={{ margin: 0 }}>{selectedDataset.image_count.toLocaleString()}</dd>

                  <dt style={{ color: "var(--muted)" }}>クラス数</dt>
                  <dd style={{ margin: 0 }}>{selectedDataset.classes.length}</dd>

                  <dt style={{ color: "var(--muted)" }}>作成日時</dt>
                  <dd style={{ margin: 0 }}>{formatDate(selectedDataset.created_at)}</dd>

                  <dt style={{ color: "var(--muted)" }}>パス</dt>
                  <dd
                    style={{
                      margin: 0,
                      fontFamily: "monospace",
                      fontSize: "0.82rem",
                      wordBreak: "break-all",
                    }}
                  >
                    {selectedDataset.path}
                  </dd>
                </dl>

                {selectedDataset.classes.length > 0 && (
                  <div>
                    <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0.5rem 0 0.75rem" }}>
                      クラス一覧
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                      {selectedDataset.classes.map((cls, i) => (
                        <span
                          key={i}
                          style={{
                            padding: "2px 10px",
                            borderRadius: "12px",
                            fontSize: "0.8rem",
                            background: "rgba(124, 240, 186, 0.12)",
                            color: "#7cf0ba",
                            border: "1px solid rgba(124, 240, 186, 0.25)",
                          }}
                        >
                          {cls}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: "var(--muted)", padding: "1rem" }}>データセットを選択してください</p>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
