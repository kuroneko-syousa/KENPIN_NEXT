"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT, interpolate } from "@/lib/i18n";

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

type DatasetSampleImage = {
  id: string;
  file_name: string;
  image_path: string;
  split: string | null;
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

function buildDatasetImageUrl(datasetId: string, imagePath: string): string {
  const encodedDatasetId = encodeURIComponent(datasetId);
  const encodedPath = imagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${API_BASE}/datasets/${encodedDatasetId}/images/${encodedPath}`;
}

function ActionIconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      title={title}
      style={{
        width: 26,
        height: 26,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.2)",
        background: "rgba(255,255,255,0.06)",
        color: "rgba(245,247,251,0.92)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

type DatasetsWorkspaceProps = {
  initialWorkspaceOptions?: WorkspaceOption[];
};

export function DatasetsWorkspace({
  initialWorkspaceOptions = [],
}: DatasetsWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const t = useT();
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

  const {
    data: sampleImages = [],
    isFetching: sampleFetching,
  } = useQuery<DatasetSampleImage[]>({
    queryKey: ["dataset-samples", selectedDataset?.dataset_id],
    enabled: Boolean(selectedDataset?.dataset_id),
    queryFn: async () => {
      if (!selectedDataset?.dataset_id) return [];
      const res = await fetch(
        `${API_BASE}/datasets/${encodeURIComponent(selectedDataset.dataset_id)}/samples?limit=1`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as DatasetSampleImage[];
    },
    refetchInterval: 15000,
  });

  const detailItems = useMemo(
    () =>
      selectedDataset
        ? [
            {
              label: t.models_detail_workspace,
              value: getWorkspaceLabel(selectedDataset.workspace_id, workspaceNameMap),
              mono: false,
            },
            {
              label: t.ds_resource_label,
              value: getResourceLabel(selectedDataset.workspace_id, workspaceOptionMap),
              mono: false,
            },
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
      setMessage(ds.locked ? t.ds_unlocked : t.ds_locked);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t.ds_op_fail);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (ds: DatasetInfo) => {
    if (!window.confirm(interpolate(t.ds_del_confirm, { id: ds.dataset_id }))) return;
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
      setMessage(t.ds_deleted);
      if (selectedId === ds.dataset_id) setSelectedId(null);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t.ds_del_fail);
    } finally {
      setBusyId(null);
    }
  };

  const handleShare = async (ds: DatasetInfo, revoke: boolean) => {
    const email = shareEmail.trim().toLowerCase();
    if (!email) {
      setMessage(t.ds_share_need_email);
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
      setMessage(revoke ? t.ds_unshared : t.ds_shared);
      setShareEmail("");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t.ds_share_fail);
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
              <h2 style={{ margin: 0 }}>{t.ds_h2}</h2>
              <button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                aria-label={t.ds_refresh}
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
            <p className="muted">{t.ds_desc}</p>
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
            <span style={{ color: "var(--muted)", fontSize: "0.82rem", whiteSpace: "nowrap" }}>{t.ds_filter}</span>
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
                  {w === "all" ? t.ds_all : getWorkspaceLabel(w, workspaceNameMap)}
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
          {t.loading}
        </div>
      )}

      {isError && (
        <div className="panel" style={{ color: "#ef4444", padding: "1rem" }}>
          {t.error_prefix} {error instanceof Error ? error.message : t.ds_load_fail}
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="panel" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
          {t.ds_none}
        </div>
      )}

      {filtered.length > 0 && (
        <section className="detail-grid">
          <article className="panel">
            <div className="selection-list">
              {filtered.map((ds) => (
                <div
                  key={ds.dataset_id}
                  className={
                    selectedDataset?.dataset_id === ds.dataset_id
                      ? "selection-card workspace-selection-card active"
                      : "selection-card workspace-selection-card"
                  }
                  onClick={() => setSelectedId(ds.dataset_id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(ds.dataset_id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <strong style={{ fontSize: "0.9rem", wordBreak: "break-word" }}>
                      {getDatasetTitle(ds, workspaceNameMap)}
                    </strong>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                      <ActionIconButton
                        title={ds.locked ? t.btn_unlock : t.btn_lock}
                        disabled={busyId === ds.dataset_id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleLockToggle(ds);
                        }}
                      >
                        {ds.locked ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="4" y="11" width="16" height="9" rx="2" />
                            <path d="M8 11V8a4 4 0 1 1 8 0" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="4" y="11" width="16" height="9" rx="2" />
                            <path d="M9 11V8a3 3 0 0 1 6 0" />
                          </svg>
                        )}
                      </ActionIconButton>
                      <ActionIconButton
                        title={ds.locked ? t.ds_locked_no_del : t.delete}
                        disabled={busyId === ds.dataset_id || !!ds.locked}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDelete(ds);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6l-1 14H6L5 6" />
                        </svg>
                      </ActionIconButton>
                    </div>
                  </div>
                  <span>
                    {ds.source === "workspace"
                      ? interpolate(t.ds_id_label, { id: ds.dataset_id })
                      : t.ds_uploaded}
                  </span>
                  <span>
                    {interpolate(t.ds_count_summary, { images: ds.image_count.toLocaleString(), classes: ds.classes.length })}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            {selectedDataset ? (
              <>
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">{t.ds_detail_eyebrow}</p>
                    <h3 style={{ fontSize: "1rem", wordBreak: "break-word" }}>
                      {getDatasetTitle(selectedDataset, workspaceNameMap)}
                    </h3>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: "0.75rem" }}>
                  <div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                        gap: "0.4rem",
                        marginBottom: "0.6rem",
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
                        <p style={{ margin: 0, fontSize: "0.66rem", color: "var(--muted)" }}>{t.ds_img_count}</p>
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
                        <p style={{ margin: 0, fontSize: "0.66rem", color: "var(--muted)" }}>{t.ds_class_count}</p>
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
                        <p style={{ margin: 0, fontSize: "0.66rem", color: "var(--muted)" }}>作成日時</p>
                        <p style={{ margin: "0.08rem 0 0", fontSize: "0.76rem", fontWeight: 700 }}>
                          {formatDate(selectedDataset.created_at, t.date_locale)}
                        </p>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "0.45rem",
                        marginBottom: "0.6rem",
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
                      <div style={{ borderRadius: 10, padding: "0.42rem 0.55rem" }} />
                    </div>

                    {selectedDataset.classes.length > 0 && (
                      <div>
                        <p style={{ color: "var(--muted)", fontSize: "0.66rem", margin: "0 0 0.3rem" }}>
                          {t.ds_classes_label}
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", justifyContent: "flex-start" }}>
                          {selectedDataset.classes.map((cls, i) => (
                            <span
                              key={`${cls}-${i}`}
                              style={{
                                padding: "1px 6px",
                                borderRadius: 999,
                                fontSize: "0.65rem",
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
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                      }}
                    >
                      <p style={{ margin: "0 0 0.25rem", fontSize: "0.66rem", color: "var(--muted)" }}>{t.ds_sample_img}</p>
                      {sampleImages.length === 0 ? (
                        <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.65rem" }}>
                          {t.ds_no_sample}
                        </p>
                      ) : (
                        <div
                          key={sampleImages[0].id}
                          style={{
                            position: "relative",
                            borderRadius: 4,
                            aspectRatio: "1 / 1",
                            overflow: "hidden",
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            width: "100%",
                            maxWidth: "120px",
                          }}
                        >
                          <img
                            src={buildDatasetImageUrl(selectedDataset.dataset_id, sampleImages[0].image_path)}
                            alt={sampleImages[0].file_name}
                            loading="lazy"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                          <span
                            style={{
                              position: "absolute",
                              left: 3,
                              top: 3,
                              padding: "0px 4px",
                              borderRadius: 999,
                              fontSize: "0.5rem",
                              color: "rgba(244,246,252,0.9)",
                              background: "rgba(0,0,0,0.5)",
                              border: "1px solid rgba(255,255,255,0.18)",
                            }}
                          >
                            {sampleImages[0].split ?? "sample"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="panel" style={{ padding: "0.55rem", marginBottom: "0.65rem" }}>
                  <p style={{ margin: "0 0 0.45rem", color: "var(--muted)", fontSize: "0.8rem" }}>{t.ds_shared_users}</p>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      type="email"
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      placeholder="user@example.com"
                      style={{ minWidth: 180, fontSize: "0.85rem", padding: "0.4rem 0.5rem" }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleShare(selectedDataset, false)}
                      disabled={busyId === selectedDataset.dataset_id}
                      style={{ fontSize: "0.75rem", padding: "0.35rem 0.7rem", minHeight: "auto" }}
                    >
                      {t.ds_share_add}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleShare(selectedDataset, true)}
                      disabled={busyId === selectedDataset.dataset_id}
                      style={{ fontSize: "0.75rem", padding: "0.35rem 0.7rem", minHeight: "auto" }}
                    >
                      {t.ds_share_revoke}
                    </button>
                  </div>
                  <div style={{ marginTop: "0.35rem", fontSize: "0.72rem" }}>
                    {(selectedDataset.shared_with ?? []).length === 0 ? (
                      <span style={{ color: "var(--muted)" }}>{t.ds_no_shared}</span>
                    ) : (
                      (selectedDataset.shared_with ?? []).map((email) => (
                        <span key={email} style={{ marginRight: "0.5rem" }}>
                          {email}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p style={{ color: "var(--muted)", padding: "1rem" }}>{t.ds_select_hint}</p>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
