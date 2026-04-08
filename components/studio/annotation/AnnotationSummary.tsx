"use client";

export type AnnotationSummaryProps = {
  annotatedCount: number;
  exportPath: string;
  saving: boolean;
  saved: boolean;
  saveError: string;
  onExportYOLO: () => void;
};

/** YOLO エクスポートパネル（ステートレス） */
export default function AnnotationSummary({
  annotatedCount,
  exportPath,
  saving,
  saved,
  saveError,
  onExportYOLO,
}: AnnotationSummaryProps) {
  if (annotatedCount === 0) return null;

  return (
    <div className="panel" style={{ padding: "1.25rem", marginTop: 0 }}>
      <p className="eyebrow" style={{ marginBottom: "0.6rem" }}>
        YOLO フォーマットでエクスポート
      </p>
      <p className="muted" style={{ margin: "0 0 0.9rem" }}>
        各画像のアノテーションを YOLO 形式の .txt ファイルとして一括ダウンロードします。
        出力先はワークスペースで設定済みのリソースを自動利用します。
      </p>
      <button type="button" onClick={onExportYOLO}>
        ラベルファイルをダウンロード (YOLO)
      </button>
      <div
        style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}
      >
        <input
          value={exportPath}
          readOnly
          disabled
          placeholder="ワークスペースの出力先を自動使用"
          style={{ flex: "1 1 300px" }}
        />
        <button type="button" disabled>
          {saving ? "同期中..." : "自動設定"}
        </button>
      </div>
      {saved && (
        <p style={{ marginTop: "0.6rem", color: "#7cf0ba" }}>✓ 出力先を同期しました</p>
      )}
      {saveError && (
        <p className="form-error" style={{ marginTop: "0.6rem" }}>
          {saveError}
        </p>
      )}
    </div>
  );
}
