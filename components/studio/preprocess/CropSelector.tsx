"use client";

import { useRef, useEffect } from "react";

type Handle = "nw" | "ne" | "sw" | "se";

type DragState =
  | { type: "none" }
  | { type: "draw"; startX: number; startY: number }
  | {
      type: "move";
      startX: number;
      startY: number;
      initX: number;
      initY: number;
      initW: number;
      initH: number;
    }
  | {
      type: "resize";
      handle: Handle;
      startX: number;
      startY: number;
      initX: number;
      initY: number;
      initW: number;
      initH: number;
    };

export type CropSelectorProps = {
  src: string;
  cropX: number; // 0〜100 (%)
  cropY: number;
  cropW: number;
  cropH: number;
  onChange: (x: number, y: number, w: number, h: number) => void;
};

const MIN = 3; // 最小選択サイズ (%)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const OVERLAY = "rgba(0,0,0,0.55)";
const HANDLE_CURSORS: Record<Handle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
};

/** 矩形ドラッグで切り抜き範囲を視覚的に指定するコンポーネント */
export default function CropSelector({
  src,
  cropX,
  cropY,
  cropW,
  cropH,
  onChange,
}: CropSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState>({ type: "none" });

  const getPos = (e: MouseEvent): { x: number; y: number } => {
    const r = containerRef.current!.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100),
      y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100),
    };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = drag.current;
      if (d.type === "none") return;
      const p = getPos(e);

      if (d.type === "draw") {
        const x = clamp(Math.min(d.startX, p.x), 0, 100 - MIN);
        const y = clamp(Math.min(d.startY, p.y), 0, 100 - MIN);
        const w = clamp(Math.abs(p.x - d.startX), MIN, 100 - x);
        const h = clamp(Math.abs(p.y - d.startY), MIN, 100 - y);
        onChange(x, y, w, h);
        return;
      }

      const dx = p.x - d.startX;
      const dy = p.y - d.startY;

      if (d.type === "move") {
        onChange(
          clamp(d.initX + dx, 0, 100 - d.initW),
          clamp(d.initY + dy, 0, 100 - d.initH),
          d.initW,
          d.initH
        );
        return;
      }

      if (d.type === "resize") {
        const { initX: ix, initY: iy, initW: iw, initH: ih, handle } = d;
        if (handle === "nw") {
          const nx = clamp(ix + dx, 0, ix + iw - MIN);
          const ny = clamp(iy + dy, 0, iy + ih - MIN);
          onChange(nx, ny, iw - (nx - ix), ih - (ny - iy));
        } else if (handle === "ne") {
          const ny = clamp(iy + dy, 0, iy + ih - MIN);
          const nw = clamp(iw + dx, MIN, 100 - ix);
          onChange(ix, ny, nw, ih - (ny - iy));
        } else if (handle === "sw") {
          const nx = clamp(ix + dx, 0, ix + iw - MIN);
          const nh = clamp(ih + dy, MIN, 100 - iy);
          onChange(nx, iy, iw - (nx - ix), nh);
        } else if (handle === "se") {
          onChange(
            ix,
            iy,
            clamp(iw + dx, MIN, 100 - ix),
            clamp(ih + dy, MIN, 100 - iy)
          );
        }
      }
    };

    const onUp = () => {
      drag.current = { type: "none" };
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onChange]);

  const handles: { id: Handle; left: string; top: string }[] = [
    { id: "nw", left: `${cropX}%`, top: `${cropY}%` },
    { id: "ne", left: `${cropX + cropW}%`, top: `${cropY}%` },
    { id: "sw", left: `${cropX}%`, top: `${cropY + cropH}%` },
    { id: "se", left: `${cropX + cropW}%`, top: `${cropY + cropH}%` },
  ];

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", cursor: "crosshair", userSelect: "none" }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const r = containerRef.current!.getBoundingClientRect();
        const x = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100);
        const y = clamp(((e.clientY - r.top) / r.height) * 100, 0, 100);
        drag.current = { type: "draw", startX: x, startY: y };
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="切り抜きプレビュー"
        style={{ display: "block", width: "100%", height: "auto" }}
        draggable={false}
      />

      {/* 選択範囲外の半透明オーバーレイ（上・下・左・右） */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: `${cropY}%`, background: OVERLAY, pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: `${cropY + cropH}%`, background: OVERLAY, pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: `${cropY}%`, height: `${cropH}%`, left: 0, width: `${cropX}%`, background: OVERLAY, pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: `${cropY}%`, height: `${cropH}%`, left: `${cropX + cropW}%`, right: 0, background: OVERLAY, pointerEvents: "none" }} />

      {/* 選択矩形ボーダー（移動ハンドル） */}
      <div
        style={{
          position: "absolute",
          left: `${cropX}%`,
          top: `${cropY}%`,
          width: `${cropW}%`,
          height: `${cropH}%`,
          border: "2px solid #7cf0ba",
          boxSizing: "border-box",
          cursor: "move",
        }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          const r = containerRef.current!.getBoundingClientRect();
          const x = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100);
          const y = clamp(((e.clientY - r.top) / r.height) * 100, 0, 100);
          drag.current = {
            type: "move",
            startX: x,
            startY: y,
            initX: cropX,
            initY: cropY,
            initW: cropW,
            initH: cropH,
          };
        }}
      />

      {/* コーナーリサイズハンドル */}
      {handles.map(({ id, left, top }) => (
        <div
          key={id}
          style={{
            position: "absolute",
            left,
            top,
            width: "12px",
            height: "12px",
            background: "#7cf0ba",
            transform: "translate(-50%, -50%)",
            cursor: HANDLE_CURSORS[id],
            borderRadius: "2px",
          }}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            const r = containerRef.current!.getBoundingClientRect();
            const x = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100);
            const y = clamp(((e.clientY - r.top) / r.height) * 100, 0, 100);
            drag.current = {
              type: "resize",
              handle: id,
              startX: x,
              startY: y,
              initX: cropX,
              initY: cropY,
              initW: cropW,
              initH: cropH,
            };
          }}
        />
      ))}
    </div>
  );
}
