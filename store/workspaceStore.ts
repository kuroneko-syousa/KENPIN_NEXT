/**
 * workspaceStore — ワークスペース横断状態管理ストア
 *
 * - Zustand + persist ミドルウェアで localStorage に保存
 * - リロード時に自動復元
 * - loadFromBackend() で初回ロード時にバックエンドから最新状態を取得
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type WorkspaceStep = "preprocess" | "annotation" | "training" | "result";

export interface WorkspaceState {
  /** 現在アクティブなワークスペース ID */
  workspaceId: string;
  /** そのワークスペースに紐づくデータセット ID（datasetFolder 等） */
  datasetId: string;
  /** 直近の学習ジョブ ID */
  jobId: string;
  /** 現在のスタジオステップ */
  step: WorkspaceStep;
}

interface WorkspaceActions {
  setWorkspaceId: (id: string) => void;
  setDatasetId: (id: string) => void;
  setJobId: (id: string) => void;
  setStep: (step: WorkspaceStep) => void;
  /** 複数フィールドを一括更新する */
  setWorkspace: (patch: Partial<WorkspaceState>) => void;
  /** ワークスペースを切り替えるときに使用（step を preprocess にリセット） */
  openWorkspace: (workspaceId: string, datasetId?: string) => void;
  /** ストアを初期状態に戻す */
  reset: () => void;
  /**
   * バックエンドから最新状態を取得してストアを更新する。
   * - Next.js API 経由でワークスペース情報を確認
   * - FastAPI 経由で対応するジョブを取得
   * - ワークスペースが削除されていた場合はストアをリセット
   */
  loadFromBackend: (workspaceId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// 初期値
// ---------------------------------------------------------------------------

const INITIAL_STATE: WorkspaceState = {
  workspaceId: "",
  datasetId: "",
  jobId: "",
  step: "preprocess",
};

// ---------------------------------------------------------------------------
// ストア本体
// ---------------------------------------------------------------------------

/**
 * FastAPI バックエンドのベース URL。
 * .env に NEXT_PUBLIC_BACKEND_URL を設定すれば切り替え可能。
 */
const BACKEND_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000")
    : "http://localhost:8000";

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>()(
  persist(
    (set, get) => ({
      // --- state -----------------------------------------------------------
      ...INITIAL_STATE,

      // --- actions ---------------------------------------------------------
      setWorkspaceId: (id) => set({ workspaceId: id }),

      setDatasetId: (id) => set({ datasetId: id }),

      setJobId: (id) => set({ jobId: id }),

      setStep: (step) => set({ step }),

      setWorkspace: (patch) => set(patch),

      openWorkspace: (workspaceId, datasetId = "") =>
        set({ workspaceId, datasetId, jobId: "", step: "preprocess" }),

      reset: () => set(INITIAL_STATE),

      loadFromBackend: async (workspaceId: string) => {
        if (!workspaceId) return;

        try {
          // 1. Next.js API でワークスペースの存在を確認 + datasetFolder 取得
          const wsRes = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
            credentials: "same-origin",
          });

          if (!wsRes.ok) {
            // ワークスペースが削除されていた場合はストアをリセット
            set(INITIAL_STATE);
            return;
          }

          const ws = (await wsRes.json()) as {
            id: string;
            datasetFolder?: string | null;
          };

          const datasetId = ws.datasetFolder ?? get().datasetId;

          // 2. FastAPI からジョブ一覧を取得し、このワークスペースに対応する最新ジョブを探す
          let latestJobId = get().jobId;

          try {
            const jobsRes = await fetch(`${BACKEND_URL}/jobs`, {
              signal: AbortSignal.timeout(5_000),
            });

            if (jobsRes.ok) {
              const jobs = (await jobsRes.json()) as Array<{
                job_id: string;
                dataset_id: string;
                status: string;
                created_at: string;
              }>;

              // dataset_id がワークスペースの datasetFolder に一致する最新ジョブを選択
              const matched = jobs
                .filter((j) => j.dataset_id === datasetId)
                .sort(
                  (a, b) =>
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );

              if (matched.length > 0) {
                latestJobId = matched[0].job_id;
              }
            }
          } catch {
            // FastAPI がオフラインの場合は既存の jobId を維持
          }

          set({
            workspaceId: ws.id,
            datasetId,
            jobId: latestJobId,
          });
        } catch {
          // ネットワークエラー時は既存の状態を維持
        }
      },
    }),

    // --- persist 設定 -------------------------------------------------------
    {
      name: "kenpin-workspace-state",
      storage: createJSONStorage(() => localStorage),
      // 必要なフィールドだけを localStorage に保存（関数は除外）
      partialize: (state): WorkspaceState => ({
        workspaceId: state.workspaceId,
        datasetId: state.datasetId,
        jobId: state.jobId,
        step: state.step,
      }),
    }
  )
);

// ---------------------------------------------------------------------------
// セレクタ（再描画を最小化するための部分セレクタ）
// ---------------------------------------------------------------------------

/** 現在のステップのみを購読 */
export const useWorkspaceStep = () =>
  useWorkspaceStore((s) => s.step);

/** ワークスペース ID のみを購読 */
export const useWorkspaceId = () =>
  useWorkspaceStore((s) => s.workspaceId);

/** ジョブ ID のみを購読 */
export const useJobId = () =>
  useWorkspaceStore((s) => s.jobId);
