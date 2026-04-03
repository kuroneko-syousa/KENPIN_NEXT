/**
 * 画像DB 接続情報的定義
 * 
 * 機能:
 * - 画像DB 接続料簡鳯洓を疄次（ローカル、NAS、クラウド）
 * - アクセス機能（誤読み、誤読辻接続）を選択可能
 * - 接続状態（接続性、誤読、不可能）を追追
 */
export type ConnectionType = "local" | "nas" | "cloud";
export type ConnectionStatus = "Connected" | "Read Only" | "Offline";
export type AccessMode = "read-write" | "read-only";

export type ImageDatabaseConnectionRecord = {
  id: string;
  name: string;
  connectionType: ConnectionType;
  mountName: string;
  mountPath: string;
  storageEngine: string;
  endpoint: string;
  accessMode: AccessMode;
  status: ConnectionStatus;
  purpose: string;
  notes: string;
  imageCount: number;
  updatedAt: string;
  ownerId?: string;
  workspaceCount?: number;
};

export type ImageDatabaseConnectionPayload = {
  name: string;
  connectionType: ConnectionType;
  mountName: string;
  mountPath: string;
  storageEngine: string;
  endpoint: string;
  accessMode: AccessMode;
  status: ConnectionStatus;
  purpose: string;
  notes: string;
  imageCount: number;
};

export const connectionTypeOptions: Array<{
  id: ConnectionType;
  label: string;
  helper: string;
}> = [
  {
    id: "local",
    label: "ローカル",
    helper: "開発 PC や専用端末上のローカル保存先を登録します。",
  },
  {
    id: "nas",
    label: "NAS",
    helper: "ファイルサーバーや共有ストレージのマウント先を登録します。",
  },
  {
    id: "cloud",
    label: "クラウド",
    helper: "S3 や Blob Storage などのクラウド保存先を登録します。",
  },
];

export const accessModeOptions: Array<{
  id: AccessMode;
  label: string;
}> = [
  { id: "read-write", label: "読み書き可能" },
  { id: "read-only", label: "読み取り専用" },
];

export const statusOptions: Array<{
  id: ConnectionStatus;
  label: string;
}> = [
  { id: "Connected", label: "Connected" },
  { id: "Read Only", label: "Read Only" },
  { id: "Offline", label: "Offline" },
];

export const defaultImageDatabasePayload: ImageDatabaseConnectionPayload = {
  name: "",
  connectionType: "local",
  mountName: "",
  mountPath: "",
  storageEngine: "",
  endpoint: "",
  accessMode: "read-write",
  status: "Connected",
  purpose: "",
  notes: "",
  imageCount: 0,
};

export const connectionTypeLabel = Object.fromEntries(
  connectionTypeOptions.map((option) => [option.id, option.label]),
) as Record<ConnectionType, string>;

export const accessModeLabel = Object.fromEntries(
  accessModeOptions.map((option) => [option.id, option.label]),
) as Record<AccessMode, string>;

export function normalizeWorkspaceDatabaseType(value: string): ConnectionType {
  if (value === "local" || value === "local-mounted") return "local";
  if (value === "nas" || value === "nas-mounted") return "nas";
  if (value === "cloud" || value === "cloud-mounted") return "cloud";
  return "local";
}

export function formatConnectionTimestamp(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function validateImageDatabasePayload(payload: Partial<ImageDatabaseConnectionPayload>) {
  if (!payload.name?.trim()) return "接続先名を入力してください。";
  if (!payload.mountName?.trim()) return "マウント対象名を入力してください。";
  if (!payload.mountPath?.trim()) return "マウントパスを入力してください。";
  if (!payload.storageEngine?.trim()) return "保存方式 / エンジンを入力してください。";
  if (!payload.endpoint?.trim()) return "接続先ホスト / エンドポイントを入力してください。";
  if (!payload.purpose?.trim()) return "主な用途を入力してください。";
  if (payload.imageCount == null || Number.isNaN(payload.imageCount) || payload.imageCount < 0) {
    return "画像枚数は 0 以上の数値で入力してください。";
  }

  return null;
}
