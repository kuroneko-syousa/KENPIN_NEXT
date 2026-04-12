"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface DatasetInfo {
  dataset_id: string;
  workspace_id?: string | null;
  source: "uploaded" | "workspace";
  image_count: number;
  classes: string[];
  created_at: string;
  data_yaml: string | null;
  path: string;
  locked?: boolean;
  shared_with?: string[];
}

interface WorkspaceOption {
  id: string;
  name: string;
  resourceName: string | null;
  resourceId: string | null;
}

type DatasetPreviewTile = {
  id: string;
  label: string;
  annotated: boolean;
  state: string;
  quality: string;
  hue: number;
};

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

function getWorkspaceLabel(
  workspaceId: string | null | undefined,
  workspaceNameMap: Map<string, string>
): string {
  if (!workspaceId) return "-";
  return workspaceNameMap.get(workspaceId) ?? `未登録ワークスペース (${workspaceId})`;
}

function getDatasetTitle(ds: DatasetInfo, workspaceNameMap: Map<string, string>): string {
  if (ds.source === "workspace") {
    return getWorkspaceLabel(ds.workspace_id, workspaceNameMap);
  }
  return ds.dataset_id;
}

function getResourceLabel(
  workspaceId: string | null | undefined,
  workspaceOptionMap: Map<string, WorkspaceOption>
): string {
  if (!workspaceId) return "-";
  const workspace = workspaceOptionMap.get(workspaceId);
  if (!workspace) return "-";
  if (workspace.resourceName?.trim()) return workspace.resourceName;
  if (workspace.resourceId?.trim()) return `未登録リソース (${workspace.resourceId})`;
  return "-";
}

function buildDatasetPreviewTiles(ds: DatasetInfo): DatasetPreviewTile[] {
  const baseSeed = Array.from(ds.dataset_id).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const labels = ["原画像", "アノテーション", "学習入力"];

  return labels.map((label, index) => {
    const hue = (baseSeed + index * 43) % 360;
    const annotated = index !== 0 && ds.classes.length > 0 && ds.image_count > 0;

    return {
      id: `${ds.dataset_id}-${label}`,
      label,
      annotated,
      state: ds.locked ? "固定" : "編集中",
      quality: ds.source === "workspace" ? "自動生成" : "アップロード",
      hue,
    };
  });
}

type DatasetsWorkspaceProps = {
  initialWorkspaceOptions?: WorkspaceOption[];
};

export function DatasetsWorkspace({
  initialWorkspaceOptions = [],
}: DatasetsWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all");
  const [shareEmail, setShareEmail] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  const workspaceNameMap = useMemo(
    () => new Map(initialWorkspaceOptions.map((workspace) => [workspace.id, workspace.name])),
    [initialWorkspaceOptions]
  );

  const workspaceOptionMap = useMemo(
    () => new Map(initialWorkspaceOptions.map((workspace) => [workspace.id, workspace])),
    [initialWorkspaceOptions]
  );

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
      const res = await fetch(`${API_BASE}/datasets`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DatasetInfo[];
      if (!selectedId && data.length > 0) setSelectedId(data[0].dataset_id);
      return data;
    },
    refetchInterval: 5000,
  });

  const workspaceOptions = useMemo(() => {
    const values = new Set<string>();
    for (const ds of datasets) {
      if (ds.workspace_id) values.add(ds.workspace_id);
    }
    return ["all", ...Array.from(values).sort()];
  }, [datasets]);

  const filtered = useMemo(() => {
    if (workspaceFilter === "all") return datasets;
    return datasets.filter((ds) => ds.workspace_id === workspaceFilter);
  }, [datasets, workspaceFilter]);

  const selectedDataset =
    filtered.find((ds) => ds.dataset_id === selectedId) ?? filtered[0] ?? null;

  const previewTiles = useMemo(
    () => (selectedDataset ? buildDatasetPreviewTiles(selectedDataset) : []),
    [selectedDataset]
  );

  const detailItems = useMemo(
    () =>
      selectedDataset
        ? [
            { label: "データセットID", value: selectedDataset.dataset_id, mono: true },
            {
              label: "種別",
              value: selectedDataset.source === "workspace" ? "ワークスペース生成" : "アップロード",
              mono: false,
            },
            {
              label: "ワークスペース",
              value: getWorkspaceLabel(selectedDataset.workspace_id, workspaceNameMap),
              mono: false,
            },
            { label: "ワークスペースID", value: selectedDataset.workspace_id ?? "-", mono: true },
            {
              label: "使用リソース名",
              value: getResourceLabel(selectedDataset.workspace_id, workspaceOptionMap),
              mono: false,
            },
            { label: "保存先", value: selectedDataset.path, mono: true },
          ]
        : [],
    [selectedDataset, workspaceNameMap, workspaceOptionMap]
  );

  const refresh = async () => {
    await refetch();
  };

  const handleLockToggle = async (ds: DatasetInfo) => {
    setBusyId(ds.dataset_id);
    setMessage("");
    try {
      const res = await fetch(
        `${API_BASE}/datasets/${encodeURIComponent(ds.dataset_id)}/lock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locked: !ds.locked }),
        }
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail ?? `HTTP ${res.status}`);
      }
      setMessage(ds.locked ? "データセットのロックを解除しました。" : "データセットをロックしました。");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作に失敗しました。");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (ds: DatasetInfo) => {
    if (!window.confirm(`データセット ${ds.dataset_id} を削除しますか？`)) return;
    setBusyId(ds.dataset_id);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/datasets/${encodeURIComponent(ds.dataset_id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail ?? `HTTP ${res.status}`);
      }
      setMessage("データセットを削除しました。");
      if (selectedId === ds.dataset_id) setSelectedId(null);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "削除に失敗しました。");
    } finally {
      setBusyId(null);
    }
  };

  const handleShare = async (ds: DatasetInfo, revoke: boolean) => {
    const email = shareEmail.trim().toLowerCase();
    if (!email) {
      setMessage("先にメールアドレスを入力してください。");
      return;
    }
    setBusyId(ds.dataset_id);
    setMessage("");
    try {
      const res = await fetch(
        `${API_BASE}/datasets/${encodeURIComponent(ds.dataset_id)}/share`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, revoke }),
        }
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail ?? `HTTP ${res.status}`);
      }
      setMessage(revoke ? "共有を解除しました。" : "共有ユーザーを追加しました。");
      setShareEmail("");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "共有操作に失敗しました。");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="workspace-content">
      <section className="workspace-header">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.8rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p className="eyebrow">データセット</p>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h2 style={{ margin: 0 }}>データセット管理</h2>
              <button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                aria-label="データセットを更新"
                title={isFetching ? "更新中..." : "更新"}
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
              ワークスペースごとに生成されたデータセットも一覧表示します。
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              minWidth: 260,
              marginTop: "0.2rem",
            }}
          >
            <span style={{ color: "var(--muted)", fontSize: "0.82rem", whiteSpace: "nowrap" }}>ワークスペース絞り込み</span>
            <select
              value={workspaceFilter}
              onChange={(e) => {
                setWorkspaceFilter(e.target.value);
                setSelectedId(null);
              }}
              style={{ minWidth: 220, maxWidth: 360 }}
            >
              {workspaceOptions.map((w) => (
                <option key={w} value={w}>
                  {w === "all" ? "すべてのワークスペース" : getWorkspaceLabel(w, workspaceNameMap)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {message && (
        <div className="panel" style={{ padding: "0.75rem 1rem", marginBottom: "0.75rem" }}>
          {message}
        </div>
      )}

      {isLoading && (
        <div className="panel" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
          読み込み中...
        </div>
      )}

      {isError && (
        <div className="panel" style={{ color: "#ef4444", padding: "1rem" }}>
          エラー: {error instanceof Error ? error.message : "読み込みに失敗しました"}
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="panel" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
          データセットが見つかりません
        </div>
      )}

      {filtered.length > 0 && (
        <section className="detail-grid">
          <article className="panel">
            <div className="selection-list">
              {filtered.map((ds) => (
                <button
                  key={ds.dataset_id}
                  type="button"
                  className={
                    selectedDataset?.dataset_id === ds.dataset_id
                      ? "selection-card workspace-selection-card active"
                      : "selection-card workspace-selection-card"
                  }
                  onClick={() => setSelectedId(ds.dataset_id)}
                >
                  <strong style={{ fontSize: "0.9rem", wordBreak: "break-word" }}>
                    {getDatasetTitle(ds, workspaceNameMap)}
                  </strong>
                  <span>
                    {ds.source === "workspace"
                      ? `データセットID: ${ds.dataset_id}`
                      : "アップロード済みデータセット"}
                  </span>
                  <span>
                    画像 {ds.image_count.toLocaleString()} 枚 / クラス {ds.classes.length} 件
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
                    <p className="eyebrow">データセット詳細</p>
                    <h3 style={{ fontSize: "1rem", wordBreak: "break-word" }}>
                      {getDatasetTitle(selectedDataset, workspaceNameMap)}
                    </h3>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                    gap: "0.4rem",
                    margin: "0.55rem 0 0.65rem",
                  }}
                >
                  <div
                    style={{
                      borderRadius: 10,
                      border: "1px solid transparent",
                      padding: "0.4rem 0.55rem",
                      background: "transparent",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: "0.66rem", color: "var(--muted)" }}>画像数</p>
                    <p style={{ margin: "0.08rem 0 0", fontSize: "0.86rem", fontWeight: 700 }}>
                      {selectedDataset.image_count.toLocaleString()} 枚
                    </p>
                  </div>
                  <div
                    style={{
                      borderRadius: 10,
                      border: "1px solid transparent",
                      padding: "0.4rem 0.55rem",
                      background: "transparent",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: "0.66rem", color: "var(--muted)" }}>クラス数</p>
                    <p style={{ margin: "0.08rem 0 0", fontSize: "0.86rem", fontWeight: 700 }}>
                      {selectedDataset.classes.length} 件
                    </p>
                  </div>
                  <div
                    style={{
                      borderRadius: 10,
                      border: "1px solid transparent",
                      padding: "0.4rem 0.55rem",
                      background: "transparent",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: "0.66rem", color: "var(--muted)" }}>ロック</p>
                    <p style={{ margin: "0.08rem 0 0", fontSize: "0.86rem", fontWeight: 700 }}>
                      {selectedDataset.locked ? "有効" : "無効"}
                    </p>
                  </div>
                  <div
                    style={{
                      borderRadius: 10,
                      border: "1px solid transparent",
                      padding: "0.4rem 0.55rem",
                      background: "transparent",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: "0.66rem", color: "var(--muted)" }}>作成日時</p>
                    <p style={{ margin: "0.08rem 0 0", fontSize: "0.76rem", fontWeight: 700 }}>
                      {formatDate(selectedDataset.created_at)}
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "0.45rem",
                    marginBottom: "0.7rem",
                  }}
                >
                  {detailItems.map((item) => (
                    <div
                      key={item.label}
                      style={{
                        borderRadius: 10,
                        border: "1px solid transparent",
                        background: "transparent",
                        padding: "0.42rem 0.55rem",
                      }}
                    >
                      <p style={{ margin: 0, fontSize: "0.66rem", color: "var(--muted)" }}>{item.label}</p>
                      <p
                        style={{
                          margin: "0.08rem 0 0",
                          fontSize: "0.76rem",
                          wordBreak: "break-all",
                          fontFamily: item.mono ? "monospace" : "inherit",
                        }}
                      >
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="panel" style={{ padding: "0.55rem", marginBottom: "0.65rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.8rem" }}>サンプル画像（状態プレビュー）</p>
                    <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>コンパクト表示</span>
                  </div>
                  <div
                    style={{
                      marginTop: "0.45rem",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
                      gap: "0.4rem",
                    }}
                  >
                    {previewTiles.map((tile) => (
                      <div
                        key={tile.id}
                        style={{
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: `linear-gradient(140deg, hsla(${tile.hue}, 88%, 68%, 0.22), rgba(12,18,29,0.94))`,
                          padding: "0.34rem",
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            borderRadius: 7,
                            aspectRatio: "4 / 3",
                            overflow: "hidden",
                            background: "linear-gradient(160deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
                            border: "1px solid rgba(255,255,255,0.08)",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              left: "11%",
                              top: "16%",
                              width: "34%",
                              height: "30%",
                              border: tile.annotated
                                ? "1.5px solid rgba(124,240,186,0.85)"
                                : "1px dashed rgba(255,255,255,0.38)",
                              borderRadius: 5,
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              right: "14%",
                              bottom: "18%",
                              width: "28%",
                              height: "24%",
                              border: tile.annotated
                                ? "1.5px solid rgba(115,217,255,0.85)"
                                : "1px dashed rgba(255,255,255,0.28)",
                              borderRadius: 5,
                            }}
                          />
                          <span
                            style={{
                              position: "absolute",
                              left: 6,
                              top: 6,
                              padding: "1px 7px",
                              borderRadius: 999,
                              fontSize: "0.65rem",
                              color: tile.annotated ? "#7cf0ba" : "rgba(244,246,252,0.86)",
                              background: tile.annotated ? "rgba(124,240,186,0.18)" : "rgba(255,255,255,0.12)",
                              border: tile.annotated
                                ? "1px solid rgba(124,240,186,0.32)"
                                : "1px solid rgba(255,255,255,0.18)",
                            }}
                          >
                            {tile.annotated ? "Annot済" : "未Annot"}
                          </span>
                        </div>
                        <p style={{ margin: "0.25rem 0 0", fontSize: "0.7rem", fontWeight: 600 }}>{tile.label}</p>
                        <p style={{ margin: "0.1rem 0 0", color: "var(--muted)", fontSize: "0.64rem" }}>
                          {tile.state} / {tile.quality}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginBottom: "0.65rem" }}>
                  <button
                    type="button"
                    onClick={() => void handleLockToggle(selectedDataset)}
                    disabled={busyId === selectedDataset.dataset_id}
                  >
                    {selectedDataset.locked ? "ロック解除" : "ロック"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(selectedDataset)}
                    disabled={busyId === selectedDataset.dataset_id || !!selectedDataset.locked}
                    title={selectedDataset.locked ? "削除前にロックを解除してください" : ""}
                  >
                    削除
                  </button>
                </div>

                <div className="panel" style={{ padding: "0.55rem", marginBottom: "0.65rem" }}>
                  <p style={{ margin: "0 0 0.45rem", color: "var(--muted)", fontSize: "0.8rem" }}>共有ユーザー</p>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <input
                      type="email"
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      placeholder="user@example.com"
                      style={{ minWidth: 220 }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleShare(selectedDataset, false)}
                      disabled={busyId === selectedDataset.dataset_id}
                    >
                      共有追加
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleShare(selectedDataset, true)}
                      disabled={busyId === selectedDataset.dataset_id}
                    >
                      共有解除
                    </button>
                  </div>
                  <div style={{ marginTop: "0.45rem", fontSize: "0.76rem" }}>
                    {(selectedDataset.shared_with ?? []).length === 0 ? (
                      <span style={{ color: "var(--muted)" }}>共有ユーザーはいません</span>
                    ) : (
                      (selectedDataset.shared_with ?? []).map((email) => (
                        <span key={email} style={{ marginRight: "0.5rem" }}>
                          {email}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {selectedDataset.classes.length > 0 && (
                  <div>
                    <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "0.2rem 0 0.4rem" }}>
                      クラス一覧
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                      {selectedDataset.classes.map((cls, i) => (
                        <span
                          key={`${cls}-${i}`}
                          style={{
                            padding: "1px 8px",
                            borderRadius: 999,
                            fontSize: "0.74rem",
                            background: "rgba(124,240,186,0.12)",
                            color: "#7cf0ba",
                            border: "1px solid rgba(124,240,186,0.25)",
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
