"use client";

import {
  connectionTypeLabel,
  connectionTypeOptions,
  type ConnectionType,
  type ImageDatabaseConnectionPayload,
  type ImageDatabaseConnectionRecord,
} from "@/lib/image-database";
import { useEffect, useState } from "react";
import { useT, interpolate } from "@/lib/i18n";

type AccessMethod = {
  id: string;
  label: string;
  storageEngine: string;
};

const accessMethodsByType: Record<ConnectionType, AccessMethod[]> = {
  local: [
    { id: "direct-folder", label: "idb_method_direct_folder", storageEngine: "NTFS/Folder" },
    { id: "watch-folder", label: "idb_method_watch_folder", storageEngine: "NTFS/Watcher" },
  ],
  nas: [
    { id: "smb", label: "idb_method_smb", storageEngine: "SMB" },
    { id: "nfs", label: "idb_method_nfs", storageEngine: "NFS" },
  ],
  cloud: [
    { id: "s3", label: "idb_method_s3", storageEngine: "S3" },
    { id: "blob", label: "idb_method_blob", storageEngine: "Blob" },
  ],
};

export function ImageDatabaseWorkspace() {
  const [connections, setConnections] = useState<ImageDatabaseConnectionRecord[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
  const t = useT();
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [selectedConnectionType, setSelectedConnectionType] = useState<ConnectionType>("local");
  const [selectedMethodId, setSelectedMethodId] = useState(accessMethodsByType.local[0].id);
  const [isRegistering, setIsRegistering] = useState(false);
  const [deletingConnectionId, setDeletingConnectionId] = useState<string | null>(null);

  // 登録フォーム
  const [formName, setFormName] = useState("");
  const [formMountPath, setFormMountPath] = useState("");
  const [formEndpoint, setFormEndpoint] = useState("");

  // 編集フォーム
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMountPath, setEditMountPath] = useState("");
  const [editEndpoint, setEditEndpoint] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const availableMethods = accessMethodsByType[selectedConnectionType];
  const selectedMethod =
    availableMethods.find((method) => method.id === selectedMethodId) ?? availableMethods[0];

  const fetchConnections = async () => {
    setIsLoadingConnections(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/image-databases", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(t.idb_fetch_fail);
      }
      const data = (await response.json()) as ImageDatabaseConnectionRecord[];
      setConnections(data);

      // ローカル接続の画像枚数をバックグラウンドで取得・更新
      const localConnections = data.filter((c) => c.connectionType === "local");
      if (localConnections.length > 0) {
        Promise.all(
          localConnections.map(async (c) => {
            try {
              const res = await fetch(`/api/image-databases/${c.id}/count`);
              if (!res.ok) return null;
              const json = (await res.json()) as { count: number | null };
              return { id: c.id, count: json.count };
            } catch {
              return null;
            }
          })
        ).then((results) => {
          const countMap = new Map(
            results
              .filter((r): r is { id: string; count: number } => r !== null && r.count !== null)
              .map((r) => [r.id, r.count])
          );
          if (countMap.size > 0) {
            setConnections((prev) =>
              prev.map((c) =>
                countMap.has(c.id) ? { ...c, imageCount: countMap.get(c.id)! } : c
              )
            );
          }
        });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t.idb_fetch_fail);
    } finally {
      setIsLoadingConnections(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    setSelectedMethodId(accessMethodsByType[selectedConnectionType][0].id);
    setFormMountPath("");
    setFormEndpoint("");
  }, [selectedConnectionType]);

  const canRegister =
    formName.trim() !== "" &&
    formMountPath.trim() !== "" &&
    (selectedConnectionType === "local" || formEndpoint.trim() !== "");

  const registerConnection = async () => {
    if (!canRegister) return;

    setIsRegistering(true);
    setErrorMessage("");
    setSuccessMessage("");

    const payload: ImageDatabaseConnectionPayload = {
      name: formName.trim(),
      connectionType: selectedConnectionType,
      mountName: formName.trim().toLowerCase().replace(/[\s/\\]+/g, "-"),
      mountPath: formMountPath.trim(),
      storageEngine: selectedMethod.storageEngine,
      endpoint: selectedConnectionType === "local" ? "localhost" : formEndpoint.trim(),
      accessMode: "read-write",
      status: "Connected",
      purpose: t.idb_eyebrow,
      notes: "",
      imageCount: 0,
    };

    try {
      const response = await fetch("/api/image-databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t.idb_reg_fail);
      }

      setSuccessMessage(t.idb_registered);
      setFormName("");
      setFormMountPath("");
      setFormEndpoint("");
      await fetchConnections();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t.idb_reg_fail);
    } finally {
      setIsRegistering(false);
    }
  };

  const startEdit = (connection: ImageDatabaseConnectionRecord) => {
    setEditingId(connection.id);
    setEditName(connection.name);
    setEditMountPath(connection.mountPath);
    setEditEndpoint(connection.connectionType === "local" ? "" : connection.endpoint);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (connection: ImageDatabaseConnectionRecord) => {
    if (editName.trim() === "" || editMountPath.trim() === "") return;

    setIsSavingEdit(true);
    setErrorMessage("");
    setSuccessMessage("");

    const payload: ImageDatabaseConnectionPayload = {
      name: editName.trim(),
      connectionType: connection.connectionType as ConnectionType,
      mountName: editName.trim().toLowerCase().replace(/[\s/\\]+/g, "-"),
      mountPath: editMountPath.trim(),
      storageEngine: connection.storageEngine,
      endpoint: connection.connectionType === "local" ? "localhost" : editEndpoint.trim(),
      accessMode: connection.accessMode,
      status: connection.status,
      purpose: connection.purpose,
      notes: connection.notes,
      imageCount: connection.imageCount,
    };

    try {
      const response = await fetch(`/api/image-databases/${connection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t.idb_update_fail);
      }

      setSuccessMessage(t.idb_updated);
      setEditingId(null);
      await fetchConnections();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t.idb_update_fail);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const deleteConnection = async (connectionId: string) => {
    if (!confirm(t.idb_del_confirm)) {
      return;
    }

    setDeletingConnectionId(connectionId);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(`/api/image-databases/${connectionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t.idb_del_fail);
      }

      setSuccessMessage(t.idb_deleted);
      await fetchConnections();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t.idb_del_fail);
    } finally {
      setDeletingConnectionId(null);
    }
  };

  return (
    <div className="workspace-content">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">リソースアクセス</p>
          <h2>{t.idb_h2}</h2>
          <p className="muted">
            {t.idb_desc}
          </p>
        </div>
      </section>

      <section className="panel db-toolbar-panel">
        <div className="db-toolbar">
          <label className="db-control">
            {t.idb_conn_type}
            <select
              value={selectedConnectionType}
              onChange={(event) => setSelectedConnectionType(event.target.value as ConnectionType)}
            >
              {connectionTypeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="db-control">
            {t.idb_conn_method}
            <select value={selectedMethod.id} onChange={(event) => setSelectedMethodId(event.target.value)}>
              {availableMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {t[method.label as keyof typeof t] as string}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">接続先登録</p>
            <h3>{connectionTypeLabel[selectedConnectionType]} {t.idb_h2}</h3>
          </div>
        </div>

        <div style={{ display: "grid", gap: "0.85rem", marginTop: "0.5rem" }}>
          <label className="db-control" style={{ display: "grid", gap: "0.4rem" }}>
            <span>{t.idb_form_name} <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>{t.idb_form_name_hint}</span></span>
            <input
              type="text"
              placeholder="例: 製品画像ライン1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </label>

          {selectedConnectionType === "local" && (
            <label className="db-control" style={{ display: "grid", gap: "0.4rem" }}>
              <span>{t.idb_form_folder_path}</span>
              <input
                type="text"
                placeholder="例: D:\vision\images"
                value={formMountPath}
                onChange={(e) => setFormMountPath(e.target.value)}
              />
            </label>
          )}

          {selectedConnectionType === "nas" && (
            <>
              <label className="db-control" style={{ display: "grid", gap: "0.4rem" }}>
                <span>{t.idb_form_server}</span>
                <input
                  type="text"
                  placeholder="例: 192.168.1.100 または nas.kenpin.local"
                  value={formEndpoint}
                  onChange={(e) => setFormEndpoint(e.target.value)}
                />
              </label>
              <label className="db-control" style={{ display: "grid", gap: "0.4rem" }}>
                <span>{t.idb_form_mount_path}</span>
                <input
                  type="text"
                  placeholder="例: \\NAS-SERVER\vision\images"
                  value={formMountPath}
                  onChange={(e) => setFormMountPath(e.target.value)}
                />
              </label>
            </>
          )}

          {selectedConnectionType === "cloud" && (
            <>
              <label className="db-control" style={{ display: "grid", gap: "0.4rem" }}>
                <span>{t.idb_form_endpoint}</span>
                <input
                  type="text"
                  placeholder="例: s3.amazonaws.com または myaccount.blob.core.windows.net"
                  value={formEndpoint}
                  onChange={(e) => setFormEndpoint(e.target.value)}
                />
              </label>
              <label className="db-control" style={{ display: "grid", gap: "0.4rem" }}>
                <span>{t.idb_form_bucket}</span>
                <input
                  type="text"
                  placeholder="例: kenpin-vision-bucket"
                  value={formMountPath}
                  onChange={(e) => setFormMountPath(e.target.value)}
                />
              </label>
            </>
          )}

        </div>

        <div className="workflow-actions" style={{ marginTop: "1rem" }}>
          <button type="button" onClick={registerConnection} disabled={!canRegister || isRegistering}>
            {isRegistering ? t.idb_registering : t.idb_reg_btn}
          </button>
          <span className="muted">
            {t.idb_reg_hint}
          </span>
        </div>

        {errorMessage ? (
          <p className="form-error" style={{ marginTop: "0.8rem" }}>
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? <p style={{ marginTop: "0.8rem", color: "#7cf0ba" }}>{successMessage}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">登録済み</p>
            <h3>{t.idb_registered_h3}</h3>
          </div>
          <span>{isLoadingConnections ? t.loading : interpolate(t.idb_count, { count: connections.length })}</span>
        </div>

        {isLoadingConnections ? (
          <div className="empty-state">
            <strong>{t.idb_loading}</strong>
          </div>
        ) : connections.length === 0 ? (
          <div className="empty-state">
            <strong>{t.idb_none}</strong>
            <span>{t.idb_none_sub}</span>
          </div>
        ) : (
          <div className="selection-list">
            {connections.map((connection) => (
              <div
                key={connection.id}
                className="selection-card workspace-selection-card"
                style={{ position: "relative", padding: "0.55rem 0.9rem", paddingRight: "11rem" }}
              >
                {editingId === connection.id ? (
                  <div style={{ display: "grid", gap: "0.6rem", paddingRight: "0.5rem" }}>
                    <label className="db-control" style={{ display: "grid", gap: "0.3rem" }}>
                      <span style={{ fontSize: "0.8rem" }}>{t.idb_form_name_short}</span>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </label>
                    <label className="db-control" style={{ display: "grid", gap: "0.3rem" }}>
                      <span style={{ fontSize: "0.8rem" }}>
                        {connection.connectionType === "cloud" ? t.idb_form_bucket : t.idb_form_path}
                      </span>
                      <input
                        type="text"
                        value={editMountPath}
                        onChange={(e) => setEditMountPath(e.target.value)}
                      />
                    </label>
                    {connection.connectionType !== "local" && (
                      <label className="db-control" style={{ display: "grid", gap: "0.3rem" }}>
                        <span style={{ fontSize: "0.8rem" }}>
                          {connection.connectionType === "cloud" ? t.idb_form_endpoint : t.idb_form_server}
                        </span>
                        <input
                          type="text"
                          value={editEndpoint}
                          onChange={(e) => setEditEndpoint(e.target.value)}
                        />
                      </label>
                    )}
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.2rem" }}>
                      <button
                        type="button"
                        onClick={() => saveEdit(connection)}
                        disabled={isSavingEdit || editName.trim() === "" || editMountPath.trim() === ""}
                        style={{ fontSize: "0.8rem", padding: "0.2rem 0.7rem" }}
                      >
                        {isSavingEdit ? t.idb_saving : t.idb_save}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={cancelEdit}
                        disabled={isSavingEdit}
                        style={{ fontSize: "0.8rem", padding: "0.2rem 0.7rem" }}
                      >
                        {t.idb_cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <strong>{connection.name}</strong>
                    <span style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                      <span>{connectionTypeLabel[connection.connectionType as ConnectionType]}</span>
                      <span style={{ opacity: 0.65 }}>|</span>
                      <span>{connection.mountPath}</span>
                      <span style={{ opacity: 0.65 }}>|</span>
                      <span>{connection.imageCount.toLocaleString()} 枚</span>
                    </span>
                  </>
                )}
                {editingId !== connection.id && (
                  <div style={{ position: "absolute", top: "0.5rem", right: "0.75rem", display: "flex", gap: "0.4rem" }}>
                    <button
                      type="button"
                      className="ghost-button"
                      style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                      onClick={() => startEdit(connection)}
                    >
                      {t.idb_edit}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      style={{
                        fontSize: "0.75rem",
                        padding: "0.2rem 0.5rem",
                        color: "#ef4444",
                      }}
                      onClick={() => deleteConnection(connection.id)}
                      disabled={deletingConnectionId === connection.id}
                    >
                      {deletingConnectionId === connection.id ? t.idb_deleting : t.idb_delete}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
