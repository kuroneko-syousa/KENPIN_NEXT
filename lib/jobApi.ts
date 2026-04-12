/**
 * jobApi — FastAPI バックエンドのジョブエンドポイントと通信するユーティリティ
 *
 * エンドポイント
 *   GET  /jobs/{job_id}                   → JobDetail  (status, progress, ...)
 *   GET  /jobs/{job_id}/logs              → string     (生ログ、tail オプション付き)
 *   GET  /jobs/{job_id}/results           → JobResults (metrics, images, weights)
 *   GET  /jobs/{job_id}/images/{filename} → image file
 */

const BACKEND_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000")
    : "http://localhost:8000";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type JobStatus = "queued" | "running" | "completed" | "failed" | "stopped";

/** GET /jobs/{job_id} レスポンス（必要フィールドのみ） */
export interface JobDetail {
  job_id: string;
  status: JobStatus;
  /** queued 時の待機順（1 = 次に実行） */
  queue_position?: number | null;
  /** 学習進捗 0–100 */
  progress: number;
  model: string;
  epochs: number;
  dataset_id: string;
  logs_path: string | null;
  results_path: string | null;
  error: string | null;
  created_at: string;
}

/** results.csv の 1 エポック分のメトリクス */
export interface EpochMetrics {
  epoch: number;
  /** train/box_loss */
  "train/box_loss": number | null;
  /** train/cls_loss */
  "train/cls_loss": number | null;
  /** train/dfl_loss */
  "train/dfl_loss": number | null;
  /** val/box_loss */
  "val/box_loss": number | null;
  /** val/cls_loss */
  "val/cls_loss": number | null;
  /** val/dfl_loss */
  "val/dfl_loss": number | null;
  /** metrics/mAP50(B) */
  "metrics/mAP50(B)": number | null;
  /** metrics/mAP50-95(B) */
  "metrics/mAP50-95(B)": number | null;
  /** metrics/precision(B) */
  "metrics/precision(B)": number | null;
  /** metrics/recall(B) */
  "metrics/recall(B)": number | null;
  [key: string]: number | string | null;
}

/** GET /jobs/{job_id}/results レスポンス */
export interface JobResults {
  job_id: string;
  /** YOLO run ディレクトリの絶対パス（未生成時は null） */
  run_dir: string | null;
  /** best.pt の絶対パス（未生成時は null） */
  weights: string | null;
  /**
   * run directory 内にある画像の絶対パス一覧。
   * フロントエンドではパスのファイル名部分を
   * /jobs/{job_id}/images/{filename} で取得する。
   */
  images: string[];
  /** 直近エポックのメトリクス（CSV 最終行） */
  metrics: Partial<EpochMetrics>;
  /** 全エポック分のメトリクス履歴（グラフ描画用） */
  metrics_history: Partial<EpochMetrics>[];
}

// ---------------------------------------------------------------------------
// API 関数
// ---------------------------------------------------------------------------

/**
 * ジョブの最新状態（ステータス・進捗など）を取得する。
 *
 * @throws {Error} HTTP エラーまたはネットワークエラー時
 */
export async function fetchJobDetail(jobId: string): Promise<JobDetail> {
  const res = await fetch(`${BACKEND_URL}/jobs/${encodeURIComponent(jobId)}`, {
    // SSR キャッシュを無効化
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GET /jobs/${jobId} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<JobDetail>;
}

/**
 * ジョブのログファイル内容（プレーンテキスト）を取得する。
 *
 * @param jobId  ジョブ ID
 * @param tail   末尾 N 行のみ取得する（省略時は全行）
 * @returns ログ文字列。ログファイル未作成の場合は空文字列。
 * @throws {Error} HTTP エラーまたはネットワークエラー時
 */
export async function fetchJobLogs(jobId: string, tail?: number): Promise<string> {
  const url = new URL(`${BACKEND_URL}/jobs/${encodeURIComponent(jobId)}/logs`);
  if (tail !== undefined) {
    url.searchParams.set("tail", String(tail));
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`GET /jobs/${jobId}/logs failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/**
 * ジョブの学習結果（metrics, images, weights）を取得する。
 *
 * @param jobId ジョブ ID
 * @returns JobResults。学習中で run_dir 未生成の場合も 200 で返る（images/metrics は空）。
 * @throws {Error} HTTP エラーまたはネットワークエラー時
 */
export async function fetchJobResults(jobId: string): Promise<JobResults> {
  const res = await fetch(
    `${BACKEND_URL}/jobs/${encodeURIComponent(jobId)}/results`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(
      `GET /jobs/${jobId}/results failed: ${res.status} ${res.statusText}`,
    );
  }
  return res.json() as Promise<JobResults>;
}

/**
 * ジョブの結果画像の URL を返す。
 *
 * images[] に含まれる絶対パスからファイル名を取り出して
 * バックエンドの画像サービングエンドポイントの URL を構築する。
 *
 * @param jobId    ジョブ ID
 * @param filename 画像ファイル名（例: "results.png"）
 */
export function jobImageUrl(jobId: string, filename: string): string {
  return `${BACKEND_URL}/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(filename)}`;
}

/**
 * Request graceful stop for a running job.
 */
export async function stopJob(jobId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/jobs/${encodeURIComponent(jobId)}/stop`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`POST /jobs/${jobId}/stop failed: ${res.status} ${res.statusText}`);
  }
}
