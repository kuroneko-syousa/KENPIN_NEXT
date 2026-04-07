import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const IMAGE_EXTS = /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i;
const MAX_IMAGES = 200;

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
    return NextResponse.json(
      { error: "ローカル接続のみ画像ブラウズに対応しています" },
      { status: 400 }
    );
  }

  const folder = connection.mountPath?.trim();
  if (!folder) {
    return NextResponse.json({ error: "パスが設定されていません" }, { status: 400 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(folder);
  } catch {
    return NextResponse.json(
      { error: `フォルダが見つかりません: ${folder}` },
      { status: 404 }
    );
  }

  if (!stat.isDirectory()) {
    return NextResponse.json(
      { error: "指定パスはフォルダではありません" },
      { status: 400 }
    );
  }

  const files = fs
    .readdirSync(folder)
    .filter((f) => IMAGE_EXTS.test(f))
    .sort()
    .slice(0, MAX_IMAGES);

  const images = files.map((filename) => {
    const filePath = path.join(folder, filename);
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
        ? "image/png"
        : ext === "webp"
        ? "image/webp"
        : `image/${ext}`;
    return {
      name: filename,
      src: `data:${mime};base64,${data.toString("base64")}`,
    };
  });

  // imageCount をDBに反映
  await prisma.imageDatabaseConnection.update({
    where: { id: params.id },
    data: { imageCount: files.length },
  });

  return NextResponse.json({ images, folder, total: files.length });
}
