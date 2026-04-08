"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import type { AnnotateImage, AnyRegion, BoxRegion } from "../../../types/annotate";
import {
  isInViewport,
  toCanvas,
  toNorm,
  type Viewport,
} from "./hooks/useBoxDraw";
import { useBoxDraw } from "./hooks/useBoxDraw";

const CLASS_COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6",
  "#1abc9c", "#e67e22", "#34495e", "#e91e63", "#00bcd4",
  "#8bc34a", "#ff5722", "#607d8b", "#795548", "#ffc107", "#673ab7",
];

export function getColor(cls: string | undefined, clsList: string[]): string {
  const idx = cls ? clsList.indexOf(cls) : -1;
  return CLASS_COLORS[idx >= 0 ? idx % CLASS_COLORS.length : 0];
}

export type AnnotatorCanvasProps = {
  image: AnnotateImage | undefined;
  regions: AnyRegion[];
  selectedRegionId: string | null;
  tool: "select" | "box";
  classList: string[];
  selectedCls: string;
  onAddRegion: (region: BoxRegion) => void;
  onSelectRegion: (id: string) => void;
  onViewportChange?: (vp: Viewport) => void;
};

export default function AnnotatorCanvas({
  image,
  regions,
  selectedRegionId,
  tool,
  classList,
  selectedCls,
  onAddRegion,
  onSelectRegion,
  onViewportChange,
}: AnnotatorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageHostRef = useRef<HTMLDivElement>(null);
  const konvaLibRef = useRef<any>(null);
  const stageRef = useRef<any>(null);
  const imageLayerRef = useRef<any>(null);
  const boxLayerRef = useRef<any>(null);
  const draftLayerRef = useRef<any>(null);
  const draftRectRef = useRef<any>(null);

  const [konvaReady, setKonvaReady] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, w: 1, h: 1 });

  // --- refs for stable event handler closures ---
  const toolRef = useRef(tool);
  const selectedClsRef = useRef(selectedCls);
  const classListRef = useRef(classList);
  const viewportRef = useRef(viewport);

  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { selectedClsRef.current = selectedCls; }, [selectedCls]);
  useEffect(() => { classListRef.current = classList; }, [classList]);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  // --- addRegion callback ref ---
  const onAddRegionRef = useRef(onAddRegion);
  useEffect(() => { onAddRegionRef.current = onAddRegion; }, [onAddRegion]);

  const boxDraw = useBoxDraw({ getSelectedCls: () => selectedClsRef.current });

  // Konva 非同期ロード
  useEffect(() => {
    let cancelled = false;
    import("konva")
      .then((mod: any) => {
        if (cancelled) return;
        konvaLibRef.current = mod.default ?? mod;
        setKonvaReady(true);
      })
      .catch((err) => console.error("[AnnotatorCanvas] konva load error:", err));
    return () => { cancelled = true; };
  }, []);

  // コンテナサイズ監視
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setCanvasSize({ w: rect.width, h: rect.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Stage 初期化（一度だけ）
  useEffect(() => {
    const Konva = konvaLibRef.current;
    const el = stageHostRef.current;
    if (!Konva || !el || stageRef.current) return;

    const stage = new Konva.Stage({ container: el, width: canvasSize.w, height: canvasSize.h });
    stageRef.current = stage;
    imageLayerRef.current = new Konva.Layer();
    boxLayerRef.current = new Konva.Layer();
    draftLayerRef.current = new Konva.Layer();
    stage.add(imageLayerRef.current);
    stage.add(boxLayerRef.current);
    stage.add(draftLayerRef.current);

    const onMouseDown = () => {
      if (toolRef.current !== "box") return;
      const pos = stage.getPointerPosition();
      const vp = viewportRef.current;
      if (!pos || !isInViewport(pos.x, pos.y, vp)) return;
      const norm = toNorm(pos.x, pos.y, vp);
      boxDraw.onMouseDown(norm);
      const color = getColor(selectedClsRef.current, classListRef.current);
      const p = toCanvas(norm.x, norm.y, vp);
      if (!draftRectRef.current) {
        draftRectRef.current = new Konva.Rect({ strokeWidth: 1.5, dash: [6, 4], fillEnabled: true });
        draftLayerRef.current.add(draftRectRef.current);
      }
      draftRectRef.current.setAttrs({ x: p.x, y: p.y, width: 0, height: 0, stroke: color, fill: `${color}22` });
      draftLayerRef.current.batchDraw();
    };

    const onMouseMove = () => {
      if (!boxDraw.isDrawing()) return;
      const pos = stage.getPointerPosition();
      if (!pos || !draftRectRef.current) return;
      const vp = viewportRef.current;
      const end = toNorm(pos.x, pos.y, vp);
      // getDraftRect は start を保持しているので start を別途取り出す必要あり
      // ここでは stage の pointer 位置から直接算出する
      const draft = draftRectRef.current;
      const sx = draft.x();
      const sy = draft.y();
      const endCanvas = toCanvas(end.x, end.y, vp);
      draftRectRef.current.setAttrs({
        x: Math.min(sx, endCanvas.x),
        y: Math.min(sy, endCanvas.y),
        width: Math.abs(endCanvas.x - sx),
        height: Math.abs(endCanvas.y - sy),
      });
      draftLayerRef.current.batchDraw();
    };

    const onMouseUp = () => {
      const pos = stage.getPointerPosition();
      const vp = viewportRef.current;
      const normEnd = pos ? toNorm(pos.x, pos.y, vp) : null;
      const newRegion = boxDraw.onMouseUp(normEnd);
      if (draftRectRef.current) {
        draftRectRef.current.destroy();
        draftRectRef.current = null;
        draftLayerRef.current.batchDraw();
      }
      if (newRegion) {
        onAddRegionRef.current(newRegion);
      }
    };

    stage.on("mousedown touchstart", onMouseDown);
    stage.on("mousemove touchmove", onMouseMove);
    stage.on("mouseup touchend", onMouseUp);

    return () => {
      stage.off("mousedown touchstart", onMouseDown);
      stage.off("mousemove touchmove", onMouseMove);
      stage.off("mouseup touchend", onMouseUp);
      stage.destroy();
      stageRef.current = null;
      imageLayerRef.current = null;
      boxLayerRef.current = null;
      draftLayerRef.current = null;
      draftRectRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [konvaReady]);

  // Stage サイズ同期
  useEffect(() => {
    if (!stageRef.current) return;
    stageRef.current.size({ width: canvasSize.w, height: canvasSize.h });
    stageRef.current.batchDraw();
  }, [canvasSize.w, canvasSize.h]);

  // 画像描画
  useEffect(() => {
    const Konva = konvaLibRef.current;
    if (!konvaReady || !Konva || !imageLayerRef.current || !image?.src) return;
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      const scale = Math.min(canvasSize.w / img.naturalWidth, canvasSize.h / img.naturalHeight, 1);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      const x = (canvasSize.w - w) / 2;
      const y = (canvasSize.h - h) / 2;
      const vp: Viewport = { x, y, w, h };
      setViewport(vp);
      onViewportChange?.(vp);
      imageLayerRef.current.destroyChildren();
      imageLayerRef.current.add(new Konva.Image({ image: img, x, y, width: w, height: h }));
      imageLayerRef.current.batchDraw();
    };
    img.onerror = () => console.error("[AnnotatorCanvas] image load error:", image.name);
    img.src = image.src;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [canvasSize.h, canvasSize.w, image?.name, image?.src, konvaReady, onViewportChange]);

  // BBox 描画
  useEffect(() => {
    const Konva = konvaLibRef.current;
    const layer = boxLayerRef.current;
    if (!Konva || !layer) return;
    layer.destroyChildren();
    const boxRegions = regions.filter(
      (r): r is import("../../../types/annotate").BoxRegion => r.type === "box"
    );
    for (const region of boxRegions) {
      const p = toCanvas(region.x, region.y, viewport);
      const w = region.w * viewport.w;
      const h = region.h * viewport.h;
      const color = getColor(region.cls, classList);
      const isSelected = selectedRegionId === region.id;
      const rect = new Konva.Rect({
        x: p.x, y: p.y, width: w, height: h,
        stroke: color,
        strokeWidth: isSelected ? 2.6 : 1.6,
        fill: `${color}${isSelected ? "66" : "22"}`,
      });
      rect.on("click tap", () => onSelectRegion(region.id));
      layer.add(rect);
      if (region.cls) {
        layer.add(new Konva.Text({
          x: p.x + 4, y: p.y + 4,
          text: region.cls, fill: color,
          fontStyle: "bold", fontSize: 12,
        }));
      }
    }
    layer.batchDraw();
  }, [regions, classList, selectedRegionId, viewport, onSelectRegion]);

  return (
    <div
      ref={containerRef}
      className="kanno-canvas-wrap"
      style={{ cursor: tool === "box" ? "crosshair" : "default", position: "relative", flex: 1 }}
    >
      <div ref={stageHostRef} style={{ position: "absolute", inset: 0 }} />
      {!konvaReady && (
        <div className="kanno-loading" style={{ position: "absolute", inset: 0 }}>
          Konva を読み込み中...
        </div>
      )}
    </div>
  );
}
