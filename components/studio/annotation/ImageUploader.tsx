"use client";

import type { AnnotateImage } from "../../../types/annotate";

export type ImageUploaderProps = {
  importSourceLabel: string;
  previewImages: AnnotateImage[];
  restoreInfo: string | null;
  onFolderUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResourceImport: () => void;
  imageFolder: string;
  importLoading?: boolean;
};

/** 画像インポート + サンプルサムネイル表示（ステートレス） */
export default function ImageUploader({
  importSourceLabel,
  previewImages,
  restoreInfo,
  onFolderUpload,
  onResourceImport,
  imageFolder,
  importLoading = false,
}: ImageUploaderProps) {
  return (
    <>
      {/* 復元バナー */}
      {restoreInfo && (
        <div className="annotation-restore-banner">✅ {restoreInfo}</div>
      )}

      <div className="panel annotation-upload-panel">
        <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>
          画像を読み込む
        </p>

        {/* ─── ローディング中オーバーレイ ─── */}
        {importLoading ? (
          <div className="import-loading-wrap">
            <div className="import-spinner" />
            <span className="import-loading-label">画像リソースをインポート中...</span>
          </div>
        ) : (
        <div className="annotation-upload-zone">
          <p className="muted" style={{ margin: "0 0 0.75rem" }}>
            ワークスペースで選択したリソースから、画像を一括インポートします。
          </p>
          <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.78rem" }}>
            現在のソース: {importSourceLabel}
          </p>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            {imageFolder ? (
              <button
                type="button"
                className="annotation-upload-label"
                onClick={onResourceImport}
              >
                🗂 リソースからインポート
              </button>
            ) : (
              <label className="annotation-upload-label">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  style={{ display: "none" }}
                  // @ts-expect-error - webkitdirectory は非標準属性
                  webkitdirectory=""
                  onChange={onFolderUpload}
                />
                🗂 フォルダからインポート
              </label>
            )}
          </div>

          {previewImages.length > 0 && (
            <div style={{ marginTop: "0.9rem" }}>
              <p className="muted" style={{ margin: "0 0 0.45rem", fontSize: "0.72rem" }}>
                サンプル画像 ({previewImages.length}/{previewImages.length})
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(54px, 1fr))",
                  gap: "0.35rem",
                }}
              >
                {previewImages.map((img) => (
                  <div
                    key={img.name}
                    style={{
                      position: "relative",
                      aspectRatio: "1",
                      borderRadius: "6px",
                      overflow: "hidden",
                      border: "1px solid rgba(237, 241, 250, 0.16)",
                      backgroundColor: "rgba(9, 14, 26, 0.45)",
                    }}
                    title={img.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.src}
                      alt={img.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </>
  );
}
