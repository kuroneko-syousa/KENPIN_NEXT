"use client";

import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { PreprocessConfig, PreprocessResult } from "../../../lib/preprocess/applyPreprocess";
import PreprocessPanel from "./PreprocessPanel";

export type FullscreenPreviewProps = {
  open: boolean;
  onClose: () => void;
  previewImages: Array<{ name: string; src: string }>;
  previewIndex: number;
  onSelectPreview: (idx: number) => void;
  selectedPreview: { name: string; src: string } | null;
  afterResult: PreprocessResult | null;
  afterSrc: string | null;
  cfg: PreprocessConfig;
  onConfigChange: <K extends keyof PreprocessConfig>(key: K, value: PreprocessConfig[K]) => void;
  saving: boolean;
  saved: boolean;
  saveError: string;
  onSave: () => void;
};

/** 前処理フルスクリーンプレビューモーダル（ステートレス・Portal経由） */
export default function FullscreenPreview({
  open,
  onClose,
  previewImages,
  previewIndex,
  onSelectPreview,
  selectedPreview,
  afterResult,
  afterSrc,
  cfg,
  onConfigChange,
  saving,
  saved,
  saveError,
  onSave,
}: FullscreenPreviewProps) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="annotator-fullscreen"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          style={{ display: "flex", flexDirection: "column" }}
        >
          {/* ヘッダー */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.6rem 1rem",
              borderBottom: "1px solid rgba(237,241,250,0.1)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>⚙️ 前処理プレビュー</span>
              {previewImages.length > 0 && (
                <span className="muted" style={{ fontSize: "0.78rem" }}>
                  {previewIndex + 1} / {previewImages.length} 枚
                </span>
              )}
            </div>
            <button
              type="button"
              className="ghost-button"
              style={{ fontSize: "0.8rem", padding: "0.25rem 0.6rem" }}
              onClick={onClose}
            >
              ✕ 閉じる
            </button>
          </div>

          {/* 本体 */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* 左: 設定パネル */}
            <div
              style={{
                width: "260px",
                flexShrink: 0,
                overflowY: "auto",
                padding: "1rem",
                borderRight: "1px solid rgba(237,241,250,0.1)",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>
                前処理設定
              </p>
              <PreprocessPanel
                cfg={cfg}
                onConfigChange={onConfigChange}
                saving={saving}
                saved={saved}
                saveError={saveError}
                onSave={onSave}
              />
            </div>

            {/* 右: プレビューエリア */}
            <div
              style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
            >
              {/* サムネイル行 */}
              {previewImages.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: "0.3rem",
                    padding: "0.5rem 0.8rem",
                    overflowX: "auto",
                    flexShrink: 0,
                    borderBottom: "1px solid rgba(237,241,250,0.08)",
                  }}
                >
                  {previewImages.map((img, idx) => (
                    <button
                      key={img.name}
                      type="button"
                      onClick={() => onSelectPreview(idx)}
                      title={img.name}
                      style={{
                        padding: 0,
                        flexShrink: 0,
                        width: "52px",
                        height: "52px",
                        borderRadius: "6px",
                        overflow: "hidden",
                        cursor: "pointer",
                        border:
                          idx === previewIndex
                            ? "2px solid rgba(124,240,186,0.8)"
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
              )}

              {/* Before / After 大画像 */}
              <div
                style={{
                  flex: 1,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.8rem",
                  padding: "0.8rem",
                  overflow: "hidden",
                }}
              >
                {/* Before */}
                <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "0.5rem",
                      marginBottom: "0.4rem",
                      flexShrink: 0,
                    }}
                  >
                    <p className="eyebrow" style={{ margin: 0 }}>
                      Before（元画像）
                    </p>
                    {afterResult && (
                      <span style={{ fontSize: "0.72rem", opacity: 0.55 }}>
                        {afterResult.srcW} × {afterResult.srcH} px
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      borderRadius: "10px",
                      overflow: "hidden",
                      border: "1px solid rgba(237,241,250,0.12)",
                      background: "rgba(9,14,26,0.4)",
                    }}
                  >
                    {selectedPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedPreview.src}
                        alt="before"
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
                          opacity: 0.35,
                          fontSize: "0.85rem",
                        }}
                      >
                        画像を読み込んでください
                      </div>
                    )}
                  </div>
                </div>

                {/* After */}
                <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "0.5rem",
                      marginBottom: "0.4rem",
                      flexShrink: 0,
                    }}
                  >
                    <p className="eyebrow" style={{ margin: 0 }}>
                      After（前処理後）
                    </p>
                    {afterResult && (
                      <span
                        style={{ fontSize: "0.72rem", color: "rgba(124,240,186,0.8)" }}
                      >
                        {afterResult.outSize} × {afterResult.outSize} px
                        {afterResult.srcW !== afterResult.outSize ||
                        afterResult.srcH !== afterResult.outSize
                          ? ` ← ${afterResult.srcW}×${afterResult.srcH}`
                          : ""}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      borderRadius: "10px",
                      overflow: "hidden",
                      border: "1px solid rgba(124,240,186,0.28)",
                      background: "rgba(9,14,26,0.4)",
                    }}
                  >
                    {!selectedPreview ? (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: 0.35,
                          fontSize: "0.85rem",
                        }}
                      >
                        画像を読み込んでください
                      </div>
                    ) : afterSrc ? (
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
                          fontSize: "0.8rem",
                        }}
                      >
                        処理中...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
