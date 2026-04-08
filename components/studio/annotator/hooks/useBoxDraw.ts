"use client";

import { useRef } from "react";
import type { BoxRegion } from "../../../../types/annotate";

export type Viewport = { x: number; y: number; w: number; h: number };
type NormPoint = { x: number; y: number };

// ---- Pure geometry helpers ----

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function isInViewport(px: number, py: number, vp: Viewport): boolean {
  return px >= vp.x && py >= vp.y && px <= vp.x + vp.w && py <= vp.y + vp.h;
}

export function toNorm(px: number, py: number, vp: Viewport): NormPoint {
  return {
    x: clamp01((px - vp.x) / vp.w),
    y: clamp01((py - vp.y) / vp.h),
  };
}

export function toCanvas(nx: number, ny: number, vp: Viewport): NormPoint {
  return {
    x: vp.x + nx * vp.w,
    y: vp.y + ny * vp.h,
  };
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export type BoxDrawHandlers = {
  onMouseDown: (pos: NormPoint | null) => void;
  onMouseMove: (pos: NormPoint | null) => void;
  onMouseUp: (pos: NormPoint | null) => BoxRegion | null;
  isDrawing: () => boolean;
  getDraftRect: () => { x: number; y: number; w: number; h: number } | null;
};

type UseBoxDrawOptions = {
  getSelectedCls: () => string;
};

/**
 * BBox ドラッグ描画の純粋ロジック。
 * 副作用（Konva 操作・state 更新）はすべて呼び出し元が担う。
 */
export function useBoxDraw({ getSelectedCls }: UseBoxDrawOptions): BoxDrawHandlers {
  const drawingRef = useRef(false);
  const drawStartRef = useRef<NormPoint | null>(null);

  const onMouseDown = (pos: NormPoint | null) => {
    if (!pos) return;
    drawingRef.current = true;
    drawStartRef.current = pos;
  };

  const onMouseMove = (pos: NormPoint | null): void => {
    // 呼び出し元が isDrwing() と getDraftRect() を使って描画する
    void pos;
  };

  const onMouseUp = (pos: NormPoint | null): BoxRegion | null => {
    if (!drawingRef.current || !drawStartRef.current) return null;
    drawingRef.current = false;

    const start = drawStartRef.current;
    const end = pos ?? start;
    drawStartRef.current = null;

    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);

    if (w < 0.005 || h < 0.005) return null;

    return {
      type: "box",
      id: generateId(),
      cls: getSelectedCls(),
      x,
      y,
      w,
      h,
    };
  };

  const isDrawing = () => drawingRef.current;

  const getDraftRect = () => {
    if (!drawingRef.current || !drawStartRef.current) return null;
    return { x: drawStartRef.current.x, y: drawStartRef.current.y, w: 0, h: 0 };
  };

  return { onMouseDown, onMouseMove, onMouseUp, isDrawing, getDraftRect };
}
