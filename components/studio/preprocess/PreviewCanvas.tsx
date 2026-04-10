"use client";

import type { PreprocessResult } from "../../../lib/preprocess/applyPreprocess";

export type PreviewCanvasProps = {
  previewImages: Array<{ name: string; src: string }>;
  previewIndex: number;
  onSelectPreview: (idx: number) => void;
  selectedPreview: { name: string; src: string } | null;
  afterResult: PreprocessResult | null;
  afterSrc: string | null;
  imageFolder: string;
  importLoading: boolean;
  importError: string | null;
  onImport: () => void;
  onOpenFullscreen: () => void;
};

/** Before / After サムネイル + インポートボタン（ステートレス） */
export default function PreviewCanvas({
  previewImages,
  previewIndex,
  onSelectPreview,
  selectedPreview,
  afterResult,
  afterSrc,
  imageFolder,
  importLoading,
  importError,
  onImport,
  onOpenFullscreen,
}: PreviewCanvasProps) {
  return (
    <div className="panel annotation-upload-panel" style={{ marginBottom: "1rem" }}>
      <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>前処理プレビュー</p>
      <p className="muted" style={{ margin: "0 0 0.6rem", fontSize: "0.82rem" }}>
        画像を読み込んでプレビューを開くと、元画像を見ながら設定を調整できます。元画像は変更されません。
      </p>

      {/* ─── ローディング中オーバーレイ ─── */}
      {importLoading && (
        <div className="import-loading-wrap">
          <div className="import-spinner" />
          <span className="import-loading-label">画像フォルダを読み込み中...</span>
        </div>
      )}

      {/* ─── ボタン行（ローディング中は非表示） ─── */}
      {!importLoading && (
      <div
        style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}
      >
        {imageFolder && (
          <button
            type="button"
            className="ghost-button"
            style={{ fontSize: "0.8rem", padding: "0.3rem 0.75rem" }}
            onClick={onImport}
            disabled={importLoading}
          >
            {importLoading ? "読み込み中..." : "📂 設定フォルダから読み込み"}
          </button>
        )}
        {previewImages.length > 0 && (
          <button
            type="button"
            style={{ fontSize: "0.8rem", padding: "0.3rem 0.75rem" }}
            onClick={onOpenFullscreen}
          >
            🖼️ 前処理の調整（{previewImages.length} 枚）
          </button>
        )}
      </div>
      )}

      {importError && (
        <p style={{ color: "#f87171", fontSize: "0.78rem", marginTop: "0.5rem" }}>
          {importError}
        </p>
      )}

      {previewImages.length > 0 && (
        <div
          style={{
            marginTop: "0.9rem",
            display: "flex",
            gap: "0.8rem",
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          {/* サムネイル列 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))",
              gap: "0.3rem",
              flex: "1 1 200px",
            }}
          >
            {previewImages.slice(0, 12).map((img, idx) => (
              <button
                key={img.name}
                type="button"
                onClick={() => onSelectPreview(idx)}
                title={img.name}
                style={{
                  padding: 0,
                  borderRadius: "6px",
                  overflow: "hidden",
                  aspectRatio: "1",
                  cursor: "pointer",
                  border:
                    idx === previewIndex
                      ? "1px solid rgba(124,240,186,0.75)"
                      : "1px solid rgba(237,241,250,0.16)",
                  background: "rgba(9,14,26,0.45)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.src}
                  alt={img.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </button>
            ))}
          </div>

          {/* 選択画像の小 Before / After */}
          {selectedPreview && (
            <div style={{ display: "flex", gap: "0.5rem", flex: "0 0 auto" }}>
              <div style={{ width: "120px" }}>
                <p style={{ fontSize: "0.7rem", opacity: 0.55, marginBottom: "0.2rem" }}>
                  Before
                </p>
                {afterResult && (
                  <p style={{ fontSize: "0.66rem", opacity: 0.45, marginBottom: "0.2rem" }}>
                    {afterResult.srcW}×{afterResult.srcH}
                  </p>
                )}
                <div
                  style={{
                    borderRadius: "6px",
                    overflow: "hidden",
                    aspectRatio: "1",
                    border: "1px solid rgba(237,241,250,0.12)",
                    background: "rgba(9,14,26,0.4)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedPreview.src}
                    alt="before"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
              </div>
              <div style={{ width: "120px" }}>
                <p style={{ fontSize: "0.7rem", opacity: 0.55, marginBottom: "0.2rem" }}>
                  After
                </p>
                {afterResult && (
                  <p
                    style={{
                      fontSize: "0.66rem",
                      color: "rgba(124,240,186,0.75)",
                      marginBottom: "0.2rem",
                    }}
                  >
                    {afterResult.outW}×{afterResult.outH}
                  </p>
                )}
                <div
                  style={{
                    borderRadius: "6px",
                    overflow: "hidden",
                    aspectRatio: "1",
                    border: "1px solid rgba(124,240,186,0.28)",
                    background: "rgba(9,14,26,0.4)",
                  }}
                >
                  {afterSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={afterSrc}
                      alt="after"
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.4,
                        fontSize: "0.7rem",
                      }}
                    >
                      ...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
