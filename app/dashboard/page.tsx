import { authOptions } from "@/auth";
import { DashboardOverview } from "@/components/dashboard-overview";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";

const workspaceGenreLabels: Record<string, string> = {
  "object-detection": "物体検出",
  "anomaly-detection": "異常検知",
  segmentation: "セグメンテーション",
  "ocr-inspection": "OCR・文字検査",
  "pose-keypoint": "姿勢推定・キーポイント",
};

function getAnnotationProgress(
  entries: { regions: string }[],
  annotationData: string
) {
  // 新方式: AnnotationEntry テーブルを優先
  if (entries.length > 0) {
    const total = entries.length;
    const annotated = entries.filter((e) => {
      try { return (JSON.parse(e.regions) as unknown[]).length > 0; } catch { return false; }
    }).length;
    return { total, annotated };
  }
  // 旧方式フォールバック: annotationData JSON blob
  try {
    const parsed = JSON.parse(annotationData) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return { total: 0, annotated: 0 };
    const images = parsed as { regions?: unknown[] }[];
    const total = images.length;
    const annotated = images.filter(
      (img) => Array.isArray(img.regions) && img.regions.length > 0
    ).length;
    return { total, annotated };
  } catch {
    return { total: 0, annotated: 0 };
  }
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;

  const ownWorkspaces = userEmail
    ? await prisma.workspace.findMany({
        where: {
          owner: {
            email: userEmail,
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          id: true,
          name: true,
          target: true,
          annotationData: true,
          annotationEntries: {
            select: { regions: true },
          },
        },
      })
    : [];

  const annotationProgress = ownWorkspaces
    .map((workspace) => {
      const progress = getAnnotationProgress(
        workspace.annotationEntries,
        workspace.annotationData
      );

      const total = progress.total;
      const annotated = Math.min(progress.annotated, total);
      const completionRate = total > 0 ? Math.round((annotated / total) * 100) : 0;

      return {
        id: workspace.id,
        name: workspace.name,
        total,
        annotated,
        completionRate,
      };
    })
    .filter((item) => item.total > 0)
    .sort((a, b) => a.completionRate - b.completionRate)
    .slice(0, 6);

  const ownByGenreMap = ownWorkspaces.reduce((acc, workspace) => {
    const label = workspaceGenreLabels[workspace.target] ?? workspace.target ?? "未設定";
    acc.set(label, (acc.get(label) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());

  const ownByGenre = Array.from(ownByGenreMap.entries())
    .map(([label, value]) => ({
      label,
      value,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <DashboardOverview
      userName={session?.user?.name ?? "ゲスト"}
      userEmail={session?.user?.email ?? ""}
      userRole={session?.user?.role ?? "User"}
      workspaceStats={{
        own: ownWorkspaces.length,
        ownByGenre,
      }}
      annotationProgress={annotationProgress}
    />
  );
}
