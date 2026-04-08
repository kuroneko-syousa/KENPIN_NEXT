"use client";

import type { AnnotateImage } from "../../../types/annotate";

export type ImageListSidebarProps = {
  images: AnnotateImage[];
  currentIndex: number;
  onSelect: (idx: number) => void;
};

export default function ImageListSidebar({
  images,
  currentIndex,
  onSelect,
}: ImageListSidebarProps) {
  return (
    <div
      style={{
        width: "180px",
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
        backgroundColor: "rgba(15, 23, 40, 0.4)",
      }}
    >
      <p
        style={{
          fontSize: "0.75rem",
          fontWeight: 600,
          color: "#7cf0ba",
          padding: "0.75rem",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        📄 画像 ({images.length})
      </p>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          padding: "0.5rem",
        }}
      >
        {images.map((img, idx) => (
          <div
            key={`${img.name}-${idx}`}
            onClick={() => onSelect(idx)}
            style={{
              cursor: "pointer",
              padding: "0.5rem",
              borderRadius: "6px",
              backgroundColor:
                currentIndex === idx
                  ? "rgba(124, 240, 186, 0.15)"
                  : "rgba(255, 255, 255, 0.04)",
              border:
                currentIndex === idx
                  ? "1px solid rgba(124, 240, 186, 0.4)"
                  : "1px solid rgba(255, 255, 255, 0.08)",
              transition: "all 0.15s ease",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                paddingBottom: "75%",
                marginBottom: "0.4rem",
                overflow: "hidden",
                borderRadius: "4px",
                backgroundColor: "rgba(0, 0, 0, 0.3)",
              }}
            >
              {img.src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.src}
                  alt={img.name}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              )}
              {img.regions && img.regions.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "0.25rem",
                    right: "0.25rem",
                    background: "rgba(124, 240, 186, 0.9)",
                    color: "#0f1728",
                    fontSize: "0.55rem",
                    fontWeight: 700,
                    padding: "0.15rem 0.35rem",
                    borderRadius: "3px",
                    lineHeight: 1,
                  }}
                >
                  {img.regions.length}
                </div>
              )}
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.65rem",
                color: currentIndex === idx ? "#7cf0ba" : "rgba(255, 255, 255, 0.6)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {idx + 1}/{images.length}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
