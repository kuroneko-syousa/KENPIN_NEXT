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

  const {
    classList = ["object"],
    valRatio = 0.2,
  } = (await request.json().catch(() => ({}))) as {
    classList?: string[];
    valRatio?: number;
  };

  // valRatio を 0〜0.9 の範囲にクランプ
  const clampedValRatio = Math.min(0.9, Math.max(0, Number(valRatio) || 0.2));

  const imageFolder = workspace.imageFolder?.trim();
  if (!imageFolder || !fs.existsSync(imageFolder)) {
    return NextResponse.json(
      { error: `画像フォルダが見つかりません: ${imageFolder}` },
      { status: 400 }
    );
  }

  // 出力先: プロジェクトルート/tmp/workspaces/{workspaceId}/dataset/
  const projectRoot = process.cwd();
  const outputDir = path.join(projectRoot, "tmp", "workspaces", params.id, "dataset");
  const imagesTrainDir = path.join(outputDir, "images", "train");
  const imagesValDir   = path.join(outputDir, "images", "val");
  const labelsTrainDir = path.join(outputDir, "labels", "train");
  const labelsValDir   = path.join(outputDir, "labels", "val");

  try {
    for (const dir of [imagesTrainDir, imagesValDir, labelsTrainDir, labelsValDir]) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 既存ファイルをクリア
    for (const dir of [imagesTrainDir, imagesValDir, labelsTrainDir, labelsValDir]) {
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isFile()) fs.unlinkSync(full);
      }
    }

    const imageFiles = fs
      .readdirSync(imageFolder)
      .filter((f) => IMAGE_EXTS.test(f))
      .sort();

    // Fisher-Yates シャッフル（決定論的な分割のためシード不要・毎回ランダム）
    const shuffled = [...imageFiles];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const valCount = Math.max(1, Math.round(shuffled.length * clampedValRatio));
    const valSet   = new Set(shuffled.slice(0, valCount));

    // アノテーションエントリを imageName → regions のマップに
    const entryMap = new Map(
      workspace.annotationEntries.map((e) => [path.basename(e.imageName), e.regions])
    );

    let imageCount = 0;
    let labelCount = 0;
    let trainCount = 0;
    let valCountResult = 0;

    for (const filename of imageFiles) {
      const isTrain  = !valSet.has(filename);
      const imgDest  = isTrain ? imagesTrainDir : imagesValDir;
      const lblDest  = isTrain ? labelsTrainDir : labelsValDir;

      const srcPath = path.join(imageFolder, filename);
      fs.copyFileSync(srcPath, path.join(imgDest, filename));
      imageCount++;
      if (isTrain) trainCount++; else valCountResult++;

      // ラベルファイル生成
      const regionsJson = entryMap.get(filename) ?? "[]";
      const lines = toYoloLines(regionsJson, classList);
      fs.writeFileSync(path.join(lblDest, labelFileName(filename)), lines, "utf-8");
      if (lines.trim().length > 0) labelCount++;
    }

    // classes.txt 出力
    fs.writeFileSync(path.join(outputDir, "classes.txt"), classList.join("\n"), "utf-8");

    // dataset.yaml 出力（YOLO 学習用）
    const outDirUnix = outputDir.replace(/\\/g, "/");
    const yamlContent = [
      `path: ${outDirUnix}`,
      `train: images/train`,
      `val: images/val`,
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
      trainCount,
      valCount: valCountResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `データセット生成に失敗しました: ${message}` }, { status: 500 });
  }
}
