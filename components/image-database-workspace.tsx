"use client";

import {
  connectionTypeLabel,
  connectionTypeOptions,
  type ConnectionType,
  type ImageDatabaseConnectionPayload,
  type ImageDatabaseConnectionRecord,
} from "@/lib/image-database";
import { useEffect, useState } from "react";

type AccessMethod = {
  id: string;
  label: string;
  storageEngine: string;
};

const accessMethodsByType: Record<ConnectionType, AccessMethod[]> = {
  local: [
    { id: "direct-folder", label: "ローカルフォルダ直接指定", storageEngine: "NTFS/Folder" },
    { id: "watch-folder", label: "監視フォルダ連携", storageEngine: "NTFS/Watcher" },
  ],
  nas: [
    { id: "smb", label: "SMB共有", storageEngine: "SMB" },
    { id: "nfs", label: "NFSマウント", storageEngine: "NFS" },
  ],
  cloud: [
    { id: "s3", label: "S3バケット", storageEngine: "S3" },
    { id: "blob", label: "Azure Blob", storageEngine: "Blob" },
  ],
};

export function ImageDatabaseWorkspace() {
  const [connections, setConnections] = useState<ImageDatabaseConnectionRecord[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
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
        throw new Error("接続情報の取得に失敗しました。");
      }
      const data = (await response.json()) as ImageDatabaseConnectionRecord[];
      setConnections(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "接続情報の取得に失敗しました。");
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
      purpose: "ワークスペース用リソース",
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
        throw new Error(body.error ?? "接続先の登録に失敗しました。");
      }

      setSuccessMessage("接続先を登録しました。ワークスペース作成で選択できます。");
      setFormName("");
      setFormMountPath("");
      setFormEndpoint("");
      await fetchConnections();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "接続先の登録に失敗しました。");
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
        throw new Error(body.error ?? "接続先の更新に失敗しました。");
      }

      setSuccessMessage("接続先を更新しました。");
      setEditingId(null);
      await fetchConnections();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "接続先の更新に失敗しました。");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const deleteConnection = async (connectionId: string) => {
    if (!confirm("この保存先を削除しますか？ワークスペースで使用中の場合は削除できません。")) {
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
        throw new Error(body.error ?? "接続先の削除に失敗しました。");
      }

      setSuccessMessage("保存先を削除しました。");
      await fetchConnections();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "接続先の削除に失敗しました。");
    } finally {
      setDeletingConnectionId(null);
    }
  };

  return (
    <div className="workspace-content">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">リソースアクセス</p>
          <h2>接続先を登録</h2>
          <p className="muted">
            接続タイプと接続方法を選んで接続先を手動で登録できます。登録済みの接続先はワークスペース作成で選択できます。
          </p>
        </div>
      </section>

      <section className="panel db-toolbar-panel">
        <div className="db-toolbar">
          <label className="db-control">
            接続タイプ
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
            接続方法
            <select value={selectedMethod.id} onChange={(event) => setSelectedMethodId(event.target.value)}>
              {availableMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.label}
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
            <h3>{connectionTypeLabel[selectedConnectionType]} 接続先を登録</h3>
          </div>
        </div>

        <div style={{ display: "grid", gap: "0.85rem", marginTop: "0.5rem" }}>
          <label className="db-control" style={{ display: "grid", gap: "0.4rem" }}>
            <span>名前 <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>（ワークスペース選択画面に表示されます）</span></span>
            <input
              type="text"
              placeholder="例: 製品画像ライン1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </label>

          {selectedConnectionType === "local" && (
            <label className="db-control" style={{ display: "grid", gap: "0.4rem" }}>
              <span>フォルダパス（フルパス）</span>
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
                <span>サーバーアドレス</span>
                <input
                  type="text"
                  placeholder="例: 192.168.1.100 または nas.kenpin.local"
                  value={formEndpoint}
                  onChange={(e) => setFormEndpoint(e.target.value)}
                />
              </label>
              <label className="db-control" style={{ display: "grid", gap: "0.4rem" }}>
                <span>マウントパス</span>
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
                <span>エンドポイント</span>
                <input
                  type="text"
                  placeholder="例: s3.amazonaws.com または myaccount.blob.core.windows.net"
                  value={formEndpoint}
                  onChange={(e) => setFormEndpoint(e.target.value)}
                />
              </label>
              <label className="db-control" style={{ display: "grid", gap: "0.4rem" }}>
                <span>バケット / コンテナ名</span>
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
            {isRegistering ? "登録中..." : "接続先を登録"}
          </button>
          <span className="muted">
            登録後はワークスペース作成画面で {connectionTypeLabel[selectedConnectionType]} 接続として選択できます。
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
            <h3>ワークスペースで利用可能な接続先</h3>
          </div>
          <span>{isLoadingConnections ? "読み込み中..." : `${connections.length} 件`}</span>
        </div>

        {isLoadingConnections ? (
          <div className="empty-state">
            <strong>接続先を読み込み中です</strong>
          </div>
        ) : connections.length === 0 ? (
          <div className="empty-state">
            <strong>登録済み接続先はありません</strong>
            <span>上のフォームから接続先を登録してください。</span>
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
                      <span style={{ fontSize: "0.8rem" }}>名前</span>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </label>
                    <label className="db-control" style={{ display: "grid", gap: "0.3rem" }}>
                      <span style={{ fontSize: "0.8rem" }}>
                        {connection.connectionType === "cloud" ? "バケット / コンテナ名" : "パス"}
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
                          {connection.connectionType === "cloud" ? "エンドポイント" : "サーバーアドレス"}
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
                        {isSavingEdit ? "保存中..." : "保存"}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={cancelEdit}
                        disabled={isSavingEdit}
                        style={{ fontSize: "0.8rem", padding: "0.2rem 0.7rem" }}
                      >
                        キャンセル
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
                      編集
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
                      {deletingConnectionId === connection.id ? "削除中..." : "削除"}
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
