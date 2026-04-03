import { authOptions } from "@/auth";
import {
  formatConnectionTimestamp,
  type ImageDatabaseConnectionPayload,
  validateImageDatabasePayload,
} from "@/lib/image-database";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function toResponseItem(connection: {
  id: string;
  name: string;
  connectionType: string;
  mountName: string;
  mountPath: string;
  storageEngine: string;
  endpoint: string;
  accessMode: string;
  status: string;
  purpose: string;
  notes: string;
  imageCount: number;
  updatedAt: Date;
  ownerId: string;
}) {
  return {
    id: connection.id,
    name: connection.name,
    connectionType: connection.connectionType,
    mountName: connection.mountName,
    mountPath: connection.mountPath,
    storageEngine: connection.storageEngine,
    endpoint: connection.endpoint,
    accessMode: connection.accessMode,
    status: connection.status,
    purpose: connection.purpose,
    notes: connection.notes,
    imageCount: connection.imageCount,
    updatedAt: formatConnectionTimestamp(connection.updatedAt),
    ownerId: connection.ownerId,
  };
}

async function getCurrentUser() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return null;
  }

  return prisma.user.findUnique({
    where: { email: session.user.email },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await prisma.imageDatabaseConnection.findFirst({
    where: {
      id,
      ownerId: user.id,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const payload = (await request.json()) as Partial<ImageDatabaseConnectionPayload>;
  const validationError = validateImageDatabasePayload(payload);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const connection = await prisma.imageDatabaseConnection.update({
    where: { id: existing.id },
    data: {
      name: payload.name!.trim(),
      connectionType: payload.connectionType ?? existing.connectionType,
      mountName: payload.mountName!.trim(),
      mountPath: payload.mountPath!.trim(),
      storageEngine: payload.storageEngine!.trim(),
      endpoint: payload.endpoint!.trim(),
      accessMode: payload.accessMode ?? existing.accessMode,
      status: payload.status ?? existing.status,
      purpose: payload.purpose!.trim(),
      notes: payload.notes?.trim() ?? "",
      imageCount: Number(payload.imageCount ?? 0),
    },
  });

  return NextResponse.json(toResponseItem(connection));
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await prisma.imageDatabaseConnection.findFirst({
    where: {
      id,
      ownerId: user.id,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const linkedWorkspaces = await prisma.workspace.count({
    where: {
      ownerId: user.id,
      databaseId: id,
    },
  });

  if (linkedWorkspaces > 0) {
    return NextResponse.json(
      { error: "この接続先はワークスペースで使用中のため削除できません。" },
      { status: 409 },
    );
  }

  await prisma.imageDatabaseConnection.delete({
    where: { id: existing.id },
  });

  return NextResponse.json({ success: true });
}
