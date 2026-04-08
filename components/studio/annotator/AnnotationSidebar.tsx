"use client";

import { useState } from "react";
import type { BoxRegion } from "../../../types/annotate";
import { getColor } from "./AnnotatorCanvas";

const CLASS_COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6",
  "#1abc9c", "#e67e22", "#34495e", "#e91e63", "#00bcd4",
  "#8bc34a", "#ff5722", "#607d8b", "#795548", "#ffc107", "#673ab7",
];

export type AnnotationSidebarProps = {
  tool: "select" | "box";
  classList: string[];
  selectedCls: string;
  boxRegions: BoxRegion[];
  selectedId: string | null;
  regionClsList: string[];
  onToolChange: (tool: "select" | "box") => void;
  onSelectCls: (cls: string) => void;
  onAddClass: (label: string) => void;
  onRemoveClass: (cls: string) => void;
  onSelectRegion: (id: string) => void;
  onDeleteSelected: () => void;
};

export default function AnnotationSidebar({
  tool,
  classList,
  selectedCls,
  boxRegions,
  selectedId,
  regionClsList,
  onToolChange,
  onSelectCls,
  onAddClass,
  onRemoveClass,
  onSelectRegion,
  onDeleteSelected,
}: AnnotationSidebarProps) {
  const [newClass, setNewClass] = useState("");

  const handleAddClass = () => {
    const trimmed = newClass.trim();
    if (!trimmed) return;
    onAddClass(trimmed);
    setNewClass("");
  };

  return (
    <div className="kanno-sidebar">
      {/* ツール */}
      <div className="kanno-sidebar-section">
        <p className="kanno-sidebar-label">ツール</p>
        <button
          type="button"
          className={`kanno-side-btn${tool === "select" ? " active" : ""}`}
          onClick={() => onToolChange("select")}
        >
          <span className="kanno-side-icon">↖</span>
          <span className="kanno-side-text">選択</span>
          <span className="kanno-side-shortcut">S</span>
        </button>
        <button
          type="button"
          className={`kanno-side-btn${tool === "box" ? " active" : ""}`}
          onClick={() => onToolChange("box")}
        >
          <span className="kanno-side-icon">⬜</span>
          <span className="kanno-side-text">BBox</span>
          <span className="kanno-side-shortcut">B</span>
        </button>
      </div>

      {/* クラス */}
      <div className="kanno-sidebar-section">
        <p className="kanno-sidebar-label">クラス</p>
        {classList.map((c, i) => (
          <div key={c} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <button
              type="button"
              className={`kanno-cls-btn${selectedCls === c ? " active" : ""}`}
              style={{ "--cls-color": CLASS_COLORS[i % CLASS_COLORS.length] } as React.CSSProperties}
              onClick={() => onSelectCls(c)}
            >
              <span className="kanno-cls-dot" />
              {c}
            </button>
            <button
              type="button"
              onClick={() => onRemoveClass(c)}
              disabled={classList.length <= 1}
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "6px",
                border: "1px solid rgba(255, 255, 255, 0.16)",
                background: "rgba(255, 255, 255, 0.04)",
                color: "#fca5a5",
                cursor: classList.length <= 1 ? "not-allowed" : "pointer",
                opacity: classList.length <= 1 ? 0.45 : 1,
              }}
              title="クラスを削除"
            >
              ×
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.45rem" }}>
          <input
            value={newClass}
            onChange={(e) => setNewClass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddClass()}
            placeholder="クラス追加"
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              background: "rgba(255, 255, 255, 0.04)",
              color: "#e5ecff",
              padding: "0.4rem 0.5rem",
              fontSize: "0.78rem",
            }}
          />
          <button
            type="button"
            onClick={handleAddClass}
            style={{
              borderRadius: "8px",
              border: "1px solid rgba(124, 240, 186, 0.35)",
              background: "rgba(124, 240, 186, 0.15)",
              color: "#7cf0ba",
              padding: "0.4rem 0.55rem",
              fontSize: "0.72rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            追加
          </button>
        </div>
      </div>

      {/* アノテーション一覧 */}
      <div className="kanno-sidebar-section kanno-region-list-wrap">
        <p className="kanno-sidebar-label">BOX ({boxRegions.length})</p>
        <div className="kanno-region-list">
          {boxRegions.map((r, idx) => (
            <div
              key={r.id}
              className={`kanno-region-item${selectedId === r.id ? " active" : ""}`}
              style={{ "--cls-color": getColor(r.cls, regionClsList) } as React.CSSProperties}
              onClick={() => onSelectRegion(r.id)}
            >
              <span className="kanno-region-dot" />
              <span className="kanno-region-name">{r.cls ?? "-"} #{idx + 1}</span>
              <span className="kanno-region-type">box</span>
            </div>
          ))}
        </div>
      </div>

      {selectedId && (
        <button type="button" className="kanno-delete-btn" onClick={onDeleteSelected}>
          選択を削除 (Del)
        </button>
      )}
    </div>
  );
}
