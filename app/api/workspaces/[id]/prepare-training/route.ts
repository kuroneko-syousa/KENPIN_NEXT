import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const IMAGE_EXTS = /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i;

function labelFileName(imageName: string): string {
  const base = path.basename(imageName);
  return base.replace(/\.[^.]+$/, ".txt");
}

function toYoloLines(regionsJson: string, classList: string[]): string {
  type Region =
    | { type: "box";     cls?: string; x: number; y: number; w: number; h: number }
    | { type: "polygon"; cls?: string; points: [number, number][] }
    | { type: "point";   cls?: string; x: number; y: number };

  let regions: Region[] = [];
  try {
    regions = JSON.parse(regionsJson) as Region[];
  } catch {
    return "";
  }

  return regions
    .map((r) => {
      const clsIdx = classList.indexOf(r.cls ?? "");
      if (clsIdx < 0) return null;
      if (r.type === "box") {
        const xc = (r.x + r.w / 2).toFixed(6);
        const yc = (r.y + r.h / 2).toFixed(6);
        return `${clsIdx} ${xc} ${yc} ${r.w.toFixed(6)} ${r.h.toFixed(6)}`;
      }
      if (r.type === "polygon") {
        const pts = r.points.map(([px, py]) => `${px.toFixed(6)} ${py.toFixed(6)}`).join(" ");
        return `${clsIdx} ${pts}`;
      }
      if (r.type === "point") {
        return `${clsIdx} ${r.x.toFixed(6)} ${r.y.toFixed(6)}`;
      }
      return null;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * 前処理済み画像 + YOLO ラベルを tmp フォルダに書き出す。
 * body: { classList: string[] }
 * レスポンス: { outputDir: string; imageCount: number; labelCount: number }
 */
export async function POST(
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
    include: { owner: true, annotationEntries: true },
  });
  if (!workspace || workspace.owner.email !== session.user.email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { classList = ["object"] } = (await request.json().catch(() => ({}))) as {
    classList?: string[];
  };

  const imageFolder = workspace.imageFolder?.trim();
  if (!imageFolder || !fs.existsSync(imageFolder)) {
    return NextResponse.json(
      { error: `画像フォルダが見つかりません: ${imageFolder}` },
      { status: 400 }
    );
  }

  // 出力先: プロジェクトルート/tmp/workspaces/{workspaceId}/
  const projectRoot = process.cwd();
  const outputDir = path.join(projectRoot, "tmp", "workspaces", params.id);
  const imagesDir = path.join(outputDir, "images");
  const labelsDir = path.join(outputDir, "labels");

  fs.mkdirSync(imagesDir, { recursive: true });
  fs.mkdirSync(labelsDir, { recursive: true });

  // 既存ファイルをクリア
  for (const dir of [imagesDir, labelsDir]) {
    for (const f of fs.readdirSync(dir)) {
      fs.unlinkSync(path.join(dir, f));
    }
  }

  const imageFiles = fs
    .readdirSync(imageFolder)
    .filter((f) => IMAGE_EXTS.test(f))
    .sort();

  // アノテーションエントリを imageName → regions のマップに
  const entryMap = new Map(
    workspace.annotationEntries.map((e) => [path.basename(e.imageName), e.regions])
  );

  let imageCount = 0;
  let labelCount = 0;

  for (const filename of imageFiles) {
    const srcPath = path.join(imageFolder, filename);
    const destImagePath = path.join(imagesDir, filename);

    // 画像をそのままコピー（前処理はブラウザ側 Canvas API で実施済みのため原本を使用）
    fs.copyFileSync(srcPath, destImagePath);
    imageCount++;

    // ラベルファイル生成
    const regionsJson = entryMap.get(filename) ?? "[]";
    const lines = toYoloLines(regionsJson, classList);
    const labelPath = path.join(labelsDir, labelFileName(filename));
    fs.writeFileSync(labelPath, lines, "utf-8");
    if (lines.trim().length > 0) labelCount++;
  }

  // classes.txt 出力
  fs.writeFileSync(path.join(outputDir, "classes.txt"), classList.join("\n"), "utf-8");

  // dataset.yaml 出力（YOLO 学習用）
  const yamlContent = [
    `path: ${outputDir.replace(/\\/g, "/")}`,
    `train: images`,
    `val: images`,
    ``,
    `nc: ${classList.length}`,
    `names: [${classList.map((c) => `'${c}'`).join(", ")}]`,
  ].join("\n");
  fs.writeFileSync(path.join(outputDir, "dataset.yaml"), yamlContent, "utf-8");

  return NextResponse.json({
    outputDir,
    imageCount,
    labelCount,
    classCount: classList.length,
  });
}
