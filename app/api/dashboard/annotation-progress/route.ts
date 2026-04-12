import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

type AnnotationImage = {
  regions?: unknown;
};

function parseAnnotationProgress(annotationData: string, fallbackAnnotated: number) {
  try {
    const parsed = JSON.parse(annotationData) as unknown;
    if (!Array.isArray(parsed)) {
      return { total: fallbackAnnotated, annotated: fallbackAnnotated };
    }
    const images = parsed as AnnotationImage[];
    const total = images.length;
    const annotated = images.filter(
      (image) => Array.isArray(image.regions) && image.regions.length > 0
    ).length;
    return { total, annotated };
  } catch {
    return { total: fallbackAnnotated, annotated: fallbackAnnotated };
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
      _count: { select: { annotationEntries: true } },
    },
  });

  const progress = workspaces
    .map((workspace) => {
      const p = parseAnnotationProgress(
        workspace.annotationData,
        workspace._count.annotationEntries
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
