import { authOptions } from "@/auth";
import { DashboardOverview } from "@/components/dashboard-overview";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";

type AnnotationImage = {
  regions?: unknown;
};

const workspaceGenreLabels: Record<string, string> = {
  "object-detection": "物体検出",
  "anomaly-detection": "異常検知",
  segmentation: "セグメンテーション",
  "ocr-inspection": "OCR・文字検査",
  "pose-keypoint": "姿勢推定・キーポイント",
};

function parseAnnotationProgress(annotationData: string, fallbackAnnotated: number) {
  try {
    const parsed = JSON.parse(annotationData) as unknown;
    if (!Array.isArray(parsed)) {
      return {
        total: fallbackAnnotated,
        annotated: fallbackAnnotated,
      };
    }

    const images = parsed as AnnotationImage[];
    const total = images.length;
    const annotated = images.filter((image) => {
      return Array.isArray(image.regions) && image.regions.length > 0;
    }).length;

    return {
      total,
      annotated,
    };
  } catch {
    return {
      total: fallbackAnnotated,
      annotated: fallbackAnnotated,
    };
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
          _count: {
            select: {
              annotationEntries: true,
            },
          },
        },
      })
    : [];

  const annotationProgress = ownWorkspaces
    .map((workspace) => {
      const progress = parseAnnotationProgress(
        workspace.annotationData,
        workspace._count.annotationEntries
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
