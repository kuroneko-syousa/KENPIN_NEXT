import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaces = await prisma.workspace.findMany({
    where: { owner: { email: session.user.email } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      annotationData: true,
      annotationEntries: { select: { regions: true } },
    },
  });

  const progress = workspaces
    .map((workspace) => {
      const p = getAnnotationProgress(
        workspace.annotationEntries,
        workspace.annotationData
      );
      const total = p.total;
      const annotated = Math.min(p.annotated, total);
      const completionRate = total > 0 ? Math.round((annotated / total) * 100) : 0;
      return { id: workspace.id, name: workspace.name, total, annotated, completionRate };
    })
    .filter((item) => item.total > 0)
    .sort((a, b) => a.completionRate - b.completionRate)
    .slice(0, 6);

  return NextResponse.json(progress);
}
