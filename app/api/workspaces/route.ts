/**
 * ワークスペース管理 API エンドポイント (POST)
 * 
 * 機能:
 * - 新しいワークスペースを作成
 * - NextAuth セッション検証
 * - リクエストボディの検証
 * - Prisma を通じてデータベースに保存
 * 
 * エンドポイント: POST /api/workspaces
 * 必須フィールド: name, target, selectedModel など
 * レスポンス: { id: string, name: string, ... } (201 Created)
 */
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
    target?: string;
    selectedModel?: string;
    imageFolder?: string;
    datasetFolder?: string;
    databaseId?: string;
    databaseType?: string;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
  }

  if (!body.target?.trim()) {
    return NextResponse.json({ error: "Target is required" }, { status: 400 });
  }

  if (!body.databaseId?.trim() || !body.databaseType?.trim()) {
    return NextResponse.json({ error: "Database selection is required" }, { status: 400 });
  }

  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {
      name: session.user.name ?? "Workspace User",
      role: "Admin",
      team: "Workspace Team",
    },
    create: {
      name: session.user.name ?? "Workspace User",
      email: session.user.email,
      role: "Admin",
      team: "Workspace Team",
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: body.name.trim(),
      target: body.target.trim(),
      selectedModel: body.selectedModel?.trim() ?? "",
      imageFolder: body.imageFolder?.trim() ?? "",
      datasetFolder: body.datasetFolder?.trim() ?? "",
      databaseId: body.databaseId.trim(),
      databaseType: body.databaseType.trim(),
      ownerId: user.id,
    },
    include: {
      owner: true,
    },
  });

  return NextResponse.json({
    id: workspace.id,
    name: workspace.name,
    ownerId: workspace.ownerId,
    ownerName: workspace.owner.name,
    ownerEmail: workspace.owner.email,
    target: workspace.target,
    selectedModel: workspace.selectedModel,
    imageFolder: workspace.imageFolder,
    datasetFolder: workspace.datasetFolder,
    databaseId: workspace.databaseId,
    databaseType: workspace.databaseType,
    steps: [],
  });
}
