/**
 * 画像DB接続APIエンドポイント (GET)
 * 
 * 機能:
 * - ログイン済みユーザーの画像DB接続一覧を取得
 * - NextAuth セッション検証
 * - データベースクエリ実行
 * 
 * エンドポイント: GET /api/image-databases
 * レスポンス: { connections: ImageDatabaseConnectionResponse[] }
 */
import { authOptions } from "@/auth";
import {
  formatConnectionTimestamp,
  type ImageDatabaseConnectionPayload,
  validateImageDatabasePayload,
} from "@/lib/image-database";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

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

  return prisma.user.upsert({
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
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await prisma.imageDatabaseConnection.findMany({
    where: {
      ownerId: user.id,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return NextResponse.json(connections.map(toResponseItem));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as Partial<ImageDatabaseConnectionPayload>;
  const validationError = validateImageDatabasePayload(payload);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const connection = await prisma.imageDatabaseConnection.create({
    data: {
      name: payload.name!.trim(),
      connectionType: payload.connectionType ?? "local",
      mountName: payload.mountName!.trim(),
      mountPath: payload.mountPath!.trim(),
      storageEngine: payload.storageEngine!.trim(),
      endpoint: payload.endpoint!.trim(),
      accessMode: payload.accessMode ?? "read-write",
      status: payload.status ?? "Connected",
      purpose: payload.purpose!.trim(),
      notes: payload.notes?.trim() ?? "",
      imageCount: Number(payload.imageCount ?? 0),
      ownerId: user.id,
    },
  });

  return NextResponse.json(toResponseItem(connection), { status: 201 });
}
