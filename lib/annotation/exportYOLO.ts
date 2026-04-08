import type { AnnotateImage } from "../../types/annotate";

function labelFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/\.[^.]+$/, ".txt");
}

/**
 * アノテーション済み画像を YOLO フォーマット (.txt) としてブラウザダウンロードする。
 * classes.txt も合わせて出力する。
 */
export function exportYOLO(images: AnnotateImage[], classList: string[]): void {
  images.forEach((img) => {
    const lines = img.regions
      .map((r) => {
        const clsIdx = classList.indexOf(r.cls ?? "");
        if (clsIdx < 0) return null;

        if (r.type === "box") {
          const xc = (r.x + r.w / 2).toFixed(6);
          const yc = (r.y + r.h / 2).toFixed(6);
          return `${clsIdx} ${xc} ${yc} ${r.w.toFixed(6)} ${r.h.toFixed(6)}`;
        }
        if (r.type === "polygon") {
          const pts = r.points
            .map(([px, py]) => `${px.toFixed(6)} ${py.toFixed(6)}`)
            .join(" ");
          return `${clsIdx} ${pts}`;
        }
        if (r.type === "point") {
          return `${clsIdx} ${r.x.toFixed(6)} ${r.y.toFixed(6)}`;
        }
        return null;
      })
      .filter(Boolean)
      .join("\n");

    downloadText(lines, labelFileName(img.name));
  });

  downloadText(classList.join("\n"), "classes.txt");
}

function downloadText(content: string, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}
