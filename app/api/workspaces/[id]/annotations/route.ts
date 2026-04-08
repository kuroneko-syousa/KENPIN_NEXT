import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

/** ワークスペースに紐づくアノテーションエントリ一覧を取得 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: params.id },
    include: { owner: true },
  });
  if (!workspace || workspace.owner.email !== session.user.email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const entries = await prisma.annotationEntry.findMany({
    where: { workspaceId: params.id },
    orderBy: { imageName: "asc" },
  });

  return NextResponse.json({ entries });
}

/**
 * アノテーションエントリを一括 Upsert する。
 * body: { entries: { imageName: string; regions: string }[] }
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: params.id },
    include: { owner: true },
  });
  if (!workspace || workspace.owner.email !== session.user.email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    entries: { imageName: string; regions: string }[];
  };

  if (!Array.isArray(body.entries)) {
    return NextResponse.json({ error: "entries must be an array" }, { status: 400 });
  }

  // 全エントリを upsert（workspaceId + imageName の組み合わせで一意）
  await prisma.$transaction(
    body.entries.map((e) =>
      prisma.annotationEntry.upsert({
        where: {
          workspaceId_imageName: {
            workspaceId: params.id,
            imageName: e.imageName,
          },
        },
        create: {
          workspaceId: params.id,
          imageName: e.imageName,
          regions: e.regions,
        },
        update: {
          regions: e.regions,
        },
      })
    )
  );

  return NextResponse.json({ ok: true, count: body.entries.length });
}
