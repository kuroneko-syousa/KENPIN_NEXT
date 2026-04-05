"use client";

import {
  connectionTypeLabel,
  connectionTypeOptions,
  type ConnectionType,
  type ImageDatabaseConnectionPayload,
  type ImageDatabaseConnectionRecord,
} from "@/lib/image-database";
import { useEffect, useMemo, useRef, useState } from "react";

type GenreOption = {
  id: string;
  label: string;
  summary: string;
};

type AccessMethod = {
  id: string;
  label: string;
  storageEngine: string;
};

type DiscoveryCandidate = {
  id: string;
  name: string;
  mountName: string;
  mountPath: string;
  endpoint: string;
  imageCount: number;
  genreLabel: string;
};

const genreOptions: GenreOption[] = [
  {
    id: "product-photo",
    label: "製品画像",
    summary: "型番別の製品外観や検査前後の記録画像を扱います。",
  },
  {
    id: "defect-sample",
    label: "不良サンプル",
    summary: "異常検知学習に使う欠陥・不良サンプルを管理します。",
  },
  {
    id: "training-material",
    label: "学習素材",
    summary: "アノテーション済みの学習用セットや検証セットを扱います。",
  },
];

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

function generateCandidates(
  genre: GenreOption,
  type: ConnectionType,
  method: AccessMethod,
): DiscoveryCandidate[] {
  const stems = ["primary", "backup", "archive", "review", "staging"];

  return stems.map((stem, index) => {
    const safeGenre = genre.id.replace(/[^a-z0-9-]/g, "");
    const mountName = `${safeGenre}-${stem}`;
    const mountPath =
      type === "local"
        ? `D:\\vision\\${safeGenre}\\${stem}`
        : type === "nas"
          ? `\\\\NAS-SERVER\\vision\\${safeGenre}\\${stem}`
          : `/${safeGenre}/${stem}`;
    const endpoint =
      type === "local"
        ? "localhost"
        : type === "nas"
          ? "nas.kenpin.local"
          : `storage.${safeGenre}.example.com`;

    return {
      id: `${type}-${method.id}-${safeGenre}-${stem}`,
      name: `${genre.label} ${stem.toUpperCase()}`,
      mountName,
      mountPath,
      endpoint,
      imageCount: 1500 + index * 720,
      genreLabel: genre.label,
    };
  });
}

export function ImageDatabaseWorkspace() {
  const [connections, setConnections] = useState<ImageDatabaseConnectionRecord[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [selectedGenreId, setSelectedGenreId] = useState(genreOptions[0].id);
  const [selectedConnectionType, setSelectedConnectionType] = useState<ConnectionType>("local");
  const [selectedMethodId, setSelectedMethodId] = useState(accessMethodsByType.local[0].id);
  const [discoveredCandidates, setDiscoveredCandidates] = useState<DiscoveryCandidate[]>([]);
  const [customCandidates, setCustomCandidates] = useState<DiscoveryCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [deletingConnectionId, setDeletingConnectionId] = useState<string | null>(null);
  const [localFolderPath, setLocalFolderPath] = useState("");
  const folderInputRef = useRef<HTMLInputElement>(null);

  const selectedGenre = useMemo(
    () => genreOptions.find((option) => option.id === selectedGenreId) ?? genreOptions[0],
    [selectedGenreId],
  );

  const availableMethods = accessMethodsByType[selectedConnectionType];
  const selectedMethod =
    availableMethods.find((method) => method.id === selectedMethodId) ?? availableMethods[0];

  const candidates = useMemo(
    () => [...customCandidates, ...discoveredCandidates],
    [customCandidates, discoveredCandidates],
  );

  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null;

  const browseLocalFolder = async () => {
    if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
      try {
        const dirHandle = await (window as Window & { showDirectoryPicker: () => Promise<{ name: string }> }).showDirectoryPicker();
        setLocalFolderPath(dirHandle.name);
      } catch {
        // ユーザーがキャンセル
      }
    } else {
      folderInputRef.current?.click();
    }
  };

  const handleFolderInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const rel = files[0].webkitRelativePath;
      setLocalFolderPath(rel.split("/")[0] ?? "");
    }
  };

  const addCustomLocalCandidate = () => {
    const trimmed = localFolderPath.trim();
    if (!trimmed) return;
    const folderName = trimmed.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? trimmed;
    const custom: DiscoveryCandidate = {
      id: `local-custom-${Date.now()}`,
      name: `📁 ${folderName}`,
      mountName: folderName.toLowerCase().replace(/\s+/g, "-"),
      mountPath: trimmed,
      endpoint: "localhost",
      imageCount: 0,
      genreLabel: selectedGenre.label,
    };
    setCustomCandidates((prev) => [custom, ...prev]);
    setSelectedCandidateId(custom.id);
    setLocalFolderPath("");
  };

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
  }, [selectedConnectionType]);

  useEffect(() => {
    setIsDiscovering(true);
    setErrorMessage("");
    setSuccessMessage("");

    const timer = setTimeout(() => {
      const discovered = generateCandidates(selectedGenre, selectedConnectionType, selectedMethod);
      setDiscoveredCandidates(discovered);
      setSelectedCandidateId((prev) => prev || (discovered[0]?.id ?? ""));
      setIsDiscovering(false);
    }, 650);

    return () => {
      clearTimeout(timer);
    };
  }, [selectedGenre, selectedConnectionType, selectedMethod]);

  const registerSelectedCandidate = async () => {
    if (!selectedCandidate) return;

    setIsRegistering(true);
    setErrorMessage("");
    setSuccessMessage("");

    const payload: ImageDatabaseConnectionPayload = {
      name: `${selectedCandidate.name} 接続`,
      connectionType: selectedConnectionType,
      mountName: selectedCandidate.mountName,
      mountPath: selectedCandidate.mountPath,
      storageEngine: selectedMethod.storageEngine,
      endpoint: selectedCandidate.endpoint,
      accessMode: "read-write",
      status: "Connected",
      purpose: `${selectedGenre.label} のワークスペース用リソース`,
      notes: `method=${selectedMethod.label}`,
      imageCount: selectedCandidate.imageCount,
    };

    try {
      const response = await fetch("/api/image-databases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "接続先の登録に失敗しました。");
      }

      setSuccessMessage("接続先を登録しました。ワークスペース作成で選択できます。");
      await fetchConnections();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "接続先の登録に失敗しました。");
    } finally {
      setIsRegistering(false);
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
          <h2>ジャンル別に接続先をセットアップ</h2>
          <p className="muted">
            ジャンルと接続方式を選ぶと候補を自動検索し、選択した接続先をワークスペース作成の材料として登録できます。
          </p>
        </div>
      </section>

      <section className="panel db-toolbar-panel">
        <div className="db-toolbar">
          <label className="db-control">
            ジャンル
            <select value={selectedGenreId} onChange={(event) => setSelectedGenreId(event.target.value)}>
              {genreOptions.map((genre) => (
                <option key={genre.id} value={genre.id}>
                  {genre.label}
                </option>
              ))}
            </select>
          </label>

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

        <p className="muted" style={{ marginTop: "0.9rem" }}>
          {selectedGenre.summary}
        </p>

        {selectedConnectionType === "local" && (
          <div className="local-folder-row">
            <input
              type="text"
              placeholder="例: D:\vision\images"
              value={localFolderPath}
              onChange={(e) => setLocalFolderPath(e.target.value)}
            />
            <button
              type="button"
              className="ghost-button local-browse-btn"
              onClick={browseLocalFolder}
              title="フォルダを参照"
            >
              📁 参照...
            </button>
            <button
              type="button"
              className="ghost-button local-browse-btn"
              onClick={addCustomLocalCandidate}
              disabled={!localFolderPath.trim()}
            >
              候補として追加
            </button>
            <input
              ref={folderInputRef}
              type="file"
              style={{ display: "none" }}
              // @ts-expect-error — webkitdirectory は非標準属性
              webkitdirectory=""
              onChange={handleFolderInput}
            />
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">自動サーチ</p>
            <h3>接続候補一覧</h3>
          </div>
          <span className={isDiscovering ? "status training" : "status ready"}>
            {isDiscovering ? "検索中..." : `${candidates.length} 件`}
          </span>
        </div>

        {isDiscovering ? (
          <div className="empty-state">
            <strong>候補を検索しています</strong>
            <span>選択したジャンルと接続方法に応じて候補を収集中です。</span>
          </div>
        ) : (
          <div className="selection-list">
            {candidates.map((candidate) => (
              <div
                key={candidate.id}
                className={
                  selectedCandidateId === candidate.id
                    ? "selection-card workspace-selection-card active"
                    : "selection-card workspace-selection-card"
                }
                style={{ position: "relative", padding: "0.55rem 0.9rem", paddingRight: "5rem" }}
                onClick={() => setSelectedCandidateId(candidate.id)}
              >
                <strong>{candidate.name}</strong>
                <span style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <span>{candidate.genreLabel}</span>
                  <span style={{ opacity: 0.65 }}>|</span>
                  <span>{candidate.mountPath}</span>
                  <span style={{ opacity: 0.65 }}>|</span>
                  <span>{candidate.endpoint}</span>
                  <span style={{ opacity: 0.65 }}>|</span>
                  <span>{candidate.imageCount.toLocaleString()} 枚</span>
                </span>
                <button
                  type="button"
                  className="ghost-button"
                  style={{
                    position: "absolute",
                    top: "0.5rem",
                    right: "0.6rem",
                    fontSize: "0.75rem",
                    padding: "0.2rem 0.5rem",
                    borderRadius: "10px",
                    color: "#ef4444",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (candidate.id.startsWith("local-custom-")) {
                      setCustomCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
                    } else {
                      setDiscoveredCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
                    }
                    if (selectedCandidateId === candidate.id) {
                      setSelectedCandidateId(
                        candidates.find((c) => c.id !== candidate.id)?.id ?? "",
                      );
                    }
                  }}
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="workflow-actions" style={{ marginTop: "1rem" }}>
          <button type="button" onClick={registerSelectedCandidate} disabled={!selectedCandidate || isRegistering}>
            {isRegistering ? "登録中..." : "この候補を接続先として登録"}
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
            <span>上の候補から接続先を選び、登録してください。</span>
          </div>
        ) : (
          <div className="selection-list">
            {connections.map((connection) => (
              <div
                key={connection.id}
                className="selection-card workspace-selection-card"
                style={{ position: "relative", padding: "0.55rem 0.9rem", paddingRight: "7rem" }}
              >
                <strong>{connection.name}</strong>
                <span style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <span>{connectionTypeLabel[connection.connectionType as ConnectionType]} / {connection.storageEngine}</span>
                  <span style={{ opacity: 0.65 }}>|</span>
                  <span>{connection.mountPath}</span>
                  <span style={{ opacity: 0.65 }}>|</span>
                  <span>{connection.imageCount.toLocaleString()} 枚</span>
                </span>
                <button
                  type="button"
                  className="ghost-button"
                  style={{
                    position: "absolute",
                    top: "0.5rem",
                    right: "0.75rem",
                    fontSize: "0.75rem",
                    padding: "0.2rem 0.5rem",
                    color: "#ef4444",
                  }}
                  onClick={() => deleteConnection(connection.id)}
                  disabled={deletingConnectionId === connection.id}
                >
                  {deletingConnectionId === connection.id ? "削除中..." : "保存先を削除"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
