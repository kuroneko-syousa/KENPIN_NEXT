import type { AnnotateImage } from "../../types/annotate";
import { DEFAULT_CONFIG, applyPreprocessToDataUrl, type PreprocessConfig } from "../preprocess/applyPreprocess";

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|bmp|gif|tiff?|avif)$/i.test(file.name);
}

function getImportName(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return rel && rel.trim() ? rel : file.name;
}

/**
 * ファイル一覧を AnnotateImage[] に変換する。
 * 前処理設定（preprocessCfgJson）が指定された場合、Canvas API で処理を適用する。
 * 既存アノテーション（existingImages）が存在する場合はそのリージョンを引き継ぐ。
 */
export async function importImages(
  files: File[],
  existingImages: AnnotateImage[],
  preprocessCfgJson: string
): Promise<AnnotateImage[]> {
  const imgFiles = files.filter(isImageFile);
  if (imgFiles.length === 0) return [];

  let preprocessCfg: PreprocessConfig | null = null;
  try {
    const parsed = JSON.parse(preprocessCfgJson || "{}");
    if (Object.keys(parsed).length > 0) {
      preprocessCfg = { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch {
    // 不正な JSON は無視
  }

  const sorted = [...imgFiles].sort((a, b) =>
    getImportName(a).localeCompare(getImportName(b))
  );

  return Promise.all(
    sorted.map(
      (file) =>
        new Promise<AnnotateImage>((resolve) => {
          const name = getImportName(file);
          const reader = new FileReader();
          reader.onload = async () => {
            const rawSrc = reader.result as string;
            const src = preprocessCfg
              ? await applyPreprocessToDataUrl(rawSrc, preprocessCfg)
              : rawSrc;
            const existing = existingImages.find((img) => img.name === name);
            resolve({ src, name, regions: existing?.regions ?? [] });
          };
          reader.readAsDataURL(file);
        })
    )
  );
}

/** File[] から先頭フォルダ名を取得するユーティリティ */
export function getRootFolderLabel(files: File[]): string {
  const firstRel = (files[0] as File & { webkitRelativePath?: string } | undefined)
    ?.webkitRelativePath;
  const root = firstRel?.split("/")[0] || "選択フォルダ";
  return `${root} (${files.length} ファイル)`;
}
