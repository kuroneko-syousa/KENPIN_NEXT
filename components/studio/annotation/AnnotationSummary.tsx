"use client";

export type AnnotationSummaryProps = {
  annotatedCount: number;
  onExportYOLOZip: () => void;
};

/** YOLO エクスポートパネル（ステートレス） */
export default function AnnotationSummary({
  annotatedCount,
  onExportYOLOZip,
}: AnnotationSummaryProps) {
  if (annotatedCount === 0) return null;

  return (
    <div className="panel" style={{ padding: "1.25rem", marginTop: 0 }}>
      <p className="eyebrow" style={{ marginBottom: "0.6rem" }}>
        YOLO フォーマットでエクスポート
      </p>
      <p className="muted" style={{ margin: "0 0 0.9rem" }}>
        各画像のアノテーションを YOLO 形式の .txt ファイルとして出力します。
      </p>
      <button type="button" onClick={onExportYOLOZip}>
        📦 ZIP でまとめてダウンロード
      </button>
    </div>
  );
}
