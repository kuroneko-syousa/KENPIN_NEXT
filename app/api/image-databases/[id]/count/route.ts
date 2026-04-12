import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import fs from "fs";

const IMAGE_EXTS = /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await prisma.imageDatabaseConnection.findUnique({
    where: { id: params.id },
    include: { owner: true },
  });

  if (!connection || connection.owner.email !== session.user.email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (connection.connectionType !== "local") {
    return NextResponse.json({ count: null });
  }

  const folder = connection.mountPath?.trim();
  if (!folder) {
    return NextResponse.json({ count: 0 });
  }

  let count = 0;
  try {
    const stat = fs.statSync(folder);
    if (stat.isDirectory()) {
      count = fs.readdirSync(folder).filter((f) => IMAGE_EXTS.test(f)).length;
    }
  } catch {
    return NextResponse.json({ count: 0 });
  }

  await prisma.imageDatabaseConnection.update({
    where: { id: params.id },
    data: { imageCount: count },
  });

  return NextResponse.json({ count });
}
