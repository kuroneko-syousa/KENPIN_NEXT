/**
 * ワークスペース管理 API エンドポイント (PUT, DELETE)
 *
 * 機能:
 * - 既存ワークスペースの更新 (PUT)
 * - ワークスペースの削除 (DELETE)
 * - NextAuth セッション検証
 * - リクエストボディの検証
 * - Prisma を通じてデータベース操作
 *
 * エンドポイント: PUT/DELETE /api/workspaces/[id]
 */
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
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

  try {
    const workspace = await prisma.workspace.update({
      where: { id: params.id },
      data: {
        name: body.name.trim(),
        target: body.target.trim(),
        selectedModel: body.selectedModel?.trim() ?? "",
        imageFolder: body.imageFolder?.trim() ?? "",
        datasetFolder: body.datasetFolder?.trim() ?? "",
        databaseId: body.databaseId.trim(),
        databaseType: body.databaseType.trim(),
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
  } catch (error) {
    return NextResponse.json({ error: "Workspace not found or update failed" }, { status: 404 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    annotationExportPath?: string;
    annotationData?: string;
    preprocessConfig?: string;
  };

  const updateData: { annotationExportPath?: string; annotationData?: string; preprocessConfig?: string } = {};
  if (body.annotationExportPath !== undefined)
    updateData.annotationExportPath = body.annotationExportPath.trim();
  if (body.annotationData !== undefined)
    updateData.annotationData = body.annotationData;
  if (body.preprocessConfig !== undefined)
    updateData.preprocessConfig = body.preprocessConfig;

  try {
    const workspace = await prisma.workspace.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({
      annotationExportPath: workspace.annotationExportPath,
      annotationData: workspace.annotationData,
      preprocessConfig: workspace.preprocessConfig,
    });
  } catch {
    return NextResponse.json({ error: "Workspace not found or update failed" }, { status: 404 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.workspace.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Workspace not found or delete failed" }, { status: 404 });
  }
}