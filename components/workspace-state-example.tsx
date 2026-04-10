"use client";

/**
 * WorkspaceStateDemo — useWorkspaceStore の使用例
 *
 * 実際のページ / コンポーネントで参考にしてください。
 * ワークスペース切り替え・ステップ遷移・リロード復元を網羅しています。
 */

import { useEffect } from "react";
import {
  useWorkspaceStore,
  useWorkspaceStep,
  useWorkspaceId,
  useJobId,
  type WorkspaceStep,
} from "@/store/workspaceStore";

// ---------------------------------------------------------------------------
// ① スタジオタブバー — step だけを購読（不要な再描画を防ぐ）
// ---------------------------------------------------------------------------
export function StudioTabBar() {
  const step = useWorkspaceStep();
  const setStep = useWorkspaceStore((s) => s.setStep);

  const tabs: { key: WorkspaceStep; label: string }[] = [
    { key: "preprocess", label: "前処理" },
    { key: "annotation", label: "アノテーション" },
    { key: "training", label: "学習" },
    { key: "result", label: "結果" },
  ];

  return (
    <nav style={{ display: "flex", gap: "1rem", padding: "0.5rem 0" }}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setStep(tab.key)}
          style={{
            fontWeight: step === tab.key ? "bold" : "normal",
            textDecoration: step === tab.key ? "underline" : "none",
          }}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// ② ジョブステータスバー — jobId だけを購読
// ---------------------------------------------------------------------------
export function JobStatusBar() {
  const jobId = useJobId();

  if (!jobId) return null;

  return (
    <div style={{ fontSize: "0.875rem", color: "#666" }}>
      現在のジョブ: <code>{jobId}</code>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ③ ワークスペースプロバイダー — ページトップで一度だけマウント
//    初回ロード時に localStorage を復元し、バックエンドと同期する
// ---------------------------------------------------------------------------
interface WorkspaceProviderProps {
  workspaceId: string;
  children: React.ReactNode;
}

export function WorkspaceProvider({ workspaceId, children }: WorkspaceProviderProps) {
  const storeWorkspaceId = useWorkspaceId();
  const { openWorkspace, loadFromBackend } = useWorkspaceStore();

  useEffect(() => {
    // ワークスペースが切り替わった場合は step をリセットしてから同期
    if (storeWorkspaceId !== workspaceId) {
      openWorkspace(workspaceId);
    }
    // バックエンドから最新状態（datasetId / jobId）を取得
    loadFromBackend(workspaceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// ④ 完全な使用例 — ページコンポーネントに組み込む場合
// ---------------------------------------------------------------------------
export default function WorkspaceStateDemoPage({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { workspaceId: wid, datasetId, jobId, step } = useWorkspaceStore();
  const setJobId = useWorkspaceStore((s) => s.setJobId);
  const reset = useWorkspaceStore((s) => s.reset);

  return (
    <WorkspaceProvider workspaceId={workspaceId}>
      <div style={{ padding: "1rem" }}>
        <h2>ワークスペース状態デモ</h2>

        {/* タブナビ */}
        <StudioTabBar />

        {/* 状態表示 */}
        <pre style={{ background: "#f4f4f4", padding: "0.75rem", borderRadius: "4px" }}>
          {JSON.stringify({ wid, datasetId, jobId, step }, null, 2)}
        </pre>

        {/* ジョブ手動セット（学習開始後に呼ぶパターン） */}
        <button onClick={() => setJobId("job-example-id-123")}>
          ジョブIDをセット
        </button>

        {/* ジョブバー */}
        <JobStatusBar />

        {/* リセット */}
        <button onClick={reset} style={{ marginLeft: "0.5rem", color: "red" }}>
          ストアをリセット
        </button>
      </div>
    </WorkspaceProvider>
  );
}
