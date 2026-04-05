"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { AnnotateImage, AnyRegion, BoxRegion, DrawTool } from "../types/annotate";
export type { DrawTool } from "../types/annotate";

export type KonvaAnnotatorProps = {
  images: AnnotateImage[];
  currentIndex?: number;
  regionClsList: string[];
  defaultTool?: DrawTool;
  onSave: (updated: AnnotateImage[]) => void;
  onClose: () => void;
};

type Viewport = { x: number; y: number; w: number; h: number };
type NormPoint = { x: number; y: number };

const CLASS_COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6",
  "#1abc9c", "#e67e22", "#34495e", "#e91e63", "#00bcd4",
  "#8bc34a", "#ff5722", "#607d8b", "#795548", "#ffc107", "#673ab7",
];

function getColor(cls: string | undefined, clsList: string[]): string {
  const idx = cls ? clsList.indexOf(cls) : -1;
  return CLASS_COLORS[idx >= 0 ? idx % CLASS_COLORS.length : 0];
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function isInViewport(px: number, py: number, vp: Viewport): boolean {
  return px >= vp.x && py >= vp.y && px <= vp.x + vp.w && py <= vp.y + vp.h;
}

function toNorm(px: number, py: number, vp: Viewport): NormPoint {
  return {
    x: clamp01((px - vp.x) / vp.w),
    y: clamp01((py - vp.y) / vp.h),
  };
}

function toCanvas(nx: number, ny: number, vp: Viewport): NormPoint {
  return {
    x: vp.x + nx * vp.w,
    y: vp.y + ny * vp.h,
  };
}

// YOLO 拡張時はこの形式 (class cx cy w h) をそのまま使える。
export function boxRegionToYoloLine(region: BoxRegion, classIndex: number): string {
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  return `${classIndex} ${cx.toFixed(6)} ${cy.toFixed(6)} ${region.w.toFixed(6)} ${region.h.toFixed(6)}`;
}

export default function KonvaAnnotator({
  images,
  currentIndex = 0,
  regionClsList,
  defaultTool = "box",
  onSave,
  onClose,
}: KonvaAnnotatorProps) {
  const [allImages, setAllImages] = useState<AnnotateImage[]>(() =>
    images.map((img) => ({ ...img, regions: [...img.regions] }))
  );
  const [imgIdx, setImgIdx] = useState(currentIndex);
  const [tool, setTool] = useState<"select" | "box">(defaultTool === "select" ? "select" : "box");
  const [selectedCls, setSelectedCls] = useState<string>(regionClsList[0] ?? "object");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, w: 1, h: 1 });
  const [konvaReady, setKonvaReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  // React と Konva の removeChild 競合を避けるため、Konva 専用ホストを使う。
  const stageHostRef = useRef<HTMLDivElement>(null);
  const konvaLibRef = useRef<any>(null);
  const stageRef = useRef<any>(null);
  const imageLayerRef = useRef<any>(null);
  const boxLayerRef = useRef<any>(null);
  const draftLayerRef = useRef<any>(null);
  const draftRectRef = useRef<any>(null);
  const toolRef = useRef<"select" | "box">("box");
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, w: 1, h: 1 });
  const selectedClsRef = useRef("object");
  const regionClsListRef = useRef<string[]>([]);
  const updateRegionsRef = useRef<(fn: (prev: AnyRegion[]) => AnyRegion[]) => void>(() => {});

  const drawingRef = useRef(false);
  const drawStartRef = useRef<NormPoint | null>(null);

  const currentImg = allImages[imgIdx];
  const regions = currentImg?.regions ?? [];

  const boxRegions = useMemo(
    () => regions.filter((r): r is BoxRegion => r.type === "box"),
    [regions]
  );

  const updateRegions = useCallback(
    (fn: (prev: AnyRegion[]) => AnyRegion[]) => {
      setAllImages((prev) =>
        prev.map((img, i) => (i === imgIdx ? { ...img, regions: fn(img.regions) } : img))
      );
    },
    [imgIdx]
  );

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    selectedClsRef.current = selectedCls;
  }, [selectedCls]);

  useEffect(() => {
    regionClsListRef.current = regionClsList;
  }, [regionClsList]);

  useEffect(() => {
    updateRegionsRef.current = updateRegions;
  }, [updateRegions]);

  useEffect(() => {
    let cancelled = false;
    import("konva")
      .then((mod: any) => {
        if (cancelled) return;
        konvaLibRef.current = mod.default ?? mod;
        setKonvaReady(true);
      })
      .catch((err) => console.error("[KonvaAnnotator] konva load error:", err));

    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    const Konva = konvaLibRef.current;
    const el = stageHostRef.current;
    if (!Konva || !el || stageRef.current) return;

    // Stage は一度だけ生成し、状態更新では再生成しない。
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
      if (!pos || !isInViewport(pos.x, pos.y, viewportRef.current)) return;
      drawingRef.current = true;
      drawStartRef.current = toNorm(pos.x, pos.y, viewportRef.current);
      const p = toCanvas(drawStartRef.current.x, drawStartRef.current.y, viewportRef.current);
      const color = getColor(selectedClsRef.current, regionClsListRef.current);

      if (!draftRectRef.current) {
        draftRectRef.current = new Konva.Rect({ strokeWidth: 1.5, dash: [6, 4], fillEnabled: true });
        draftLayerRef.current.add(draftRectRef.current);
      }
      draftRectRef.current.setAttrs({ x: p.x, y: p.y, width: 0, height: 0, stroke: color, fill: `${color}22` });
      draftLayerRef.current.batchDraw();
    };

    const onMouseMove = () => {
      if (!drawingRef.current || !drawStartRef.current || !draftRectRef.current) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const end = toNorm(pos.x, pos.y, viewportRef.current);
      const sx = Math.min(drawStartRef.current.x, end.x);
      const sy = Math.min(drawStartRef.current.y, end.y);
      const ex = Math.max(drawStartRef.current.x, end.x);
      const ey = Math.max(drawStartRef.current.y, end.y);
      const p1 = toCanvas(sx, sy, viewportRef.current);
      const p2 = toCanvas(ex, ey, viewportRef.current);
      draftRectRef.current.setAttrs({ x: p1.x, y: p1.y, width: p2.x - p1.x, height: p2.y - p1.y });
      draftLayerRef.current.batchDraw();
    };

    const onMouseUp = () => {
      if (!drawingRef.current || !drawStartRef.current) return;
      drawingRef.current = false;
      const pos = stage.getPointerPosition();
      const end = pos ? toNorm(pos.x, pos.y, viewportRef.current) : drawStartRef.current;
      const x = Math.min(drawStartRef.current.x, end.x);
      const y = Math.min(drawStartRef.current.y, end.y);
      const w = Math.abs(end.x - drawStartRef.current.x);
      const h = Math.abs(end.y - drawStartRef.current.y);

      drawStartRef.current = null;
      if (draftRectRef.current) {
        draftRectRef.current.destroy();
        draftRectRef.current = null;
        draftLayerRef.current.batchDraw();
      }

      if (w < 0.005 || h < 0.005) return;
      const id = generateId();
      const next: BoxRegion = { type: "box", id, cls: selectedClsRef.current, x, y, w, h };
      updateRegionsRef.current((prev) => [...prev, next]);
      setSelectedId(id);
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
  }, [konvaReady]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.size({ width: canvasSize.w, height: canvasSize.h });
    stage.batchDraw();
  }, [canvasSize.w, canvasSize.h]);

  useEffect(() => {
    const Konva = konvaLibRef.current;
    // 画像描画は Layer 準備後に行う。先に走ると画像が表示されない。
    if (!konvaReady || !Konva || !imageLayerRef.current || !currentImg?.src) return;

    const img = new window.Image();
    let cancelled = false;
    img.onload = () => {
      if (cancelled) return;
      const maxW = canvasSize.w;
      const maxH = canvasSize.h;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      const x = (maxW - w) / 2;
      const y = (maxH - h) / 2;

      setViewport({ x, y, w, h });

      imageLayerRef.current.destroyChildren();
      imageLayerRef.current.add(new Konva.Image({ image: img, x, y, width: w, height: h }));
      imageLayerRef.current.batchDraw();
    };
    img.onerror = () => console.error("[KonvaAnnotator] image load error:", currentImg.name);
    img.src = currentImg.src;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [canvasSize.h, canvasSize.w, currentImg?.name, currentImg?.src, konvaReady]);

  useEffect(() => {
    const Konva = konvaLibRef.current;
    const layer = boxLayerRef.current;
    if (!Konva || !layer) return;

    layer.destroyChildren();

    for (const region of boxRegions) {
      const p = toCanvas(region.x, region.y, viewport);
      const w = region.w * viewport.w;
      const h = region.h * viewport.h;
      const color = getColor(region.cls, regionClsList);
      const isSelected = selectedId === region.id;

      const rect = new Konva.Rect({
        x: p.x,
        y: p.y,
        width: w,
        height: h,
        stroke: color,
        strokeWidth: isSelected ? 2.6 : 1.6,
        fill: `${color}${isSelected ? "66" : "22"}`,
      });

      rect.on("click tap", () => setSelectedId(region.id));
      layer.add(rect);

      if (region.cls) {
        layer.add(
          new Konva.Text({
            x: p.x + 4,
            y: p.y + 4,
            text: region.cls,
            fill: color,
            fontStyle: "bold",
            fontSize: 12,
          })
        );
      }
    }

    layer.batchDraw();
  }, [boxRegions, regionClsList, selectedId, viewport]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selectedId) return;
        updateRegions((prev) => prev.filter((r) => r.id !== selectedId));
        setSelectedId(null);
      }
      if (e.key === "b" || e.key === "B") setTool("box");
      if (e.key === "s" || e.key === "S") setTool("select");
      if (e.key === "ArrowRight" && imgIdx < allImages.length - 1) {
        setImgIdx((v) => Math.min(v + 1, allImages.length - 1));
        setSelectedId(null);
      }
      if (e.key === "ArrowLeft" && imgIdx > 0) {
        setImgIdx((v) => Math.max(v - 1, 0));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [allImages.length, imgIdx, selectedId, updateRegions]);

  if (!currentImg) {
    return (
      <div className="kanno-root">
        <div className="kanno-loading" style={{ margin: "1.5rem" }}>画像がありません。</div>
      </div>
    );
  }

  return (
    <div className="kanno-root">
      <div className="kanno-sidebar">
        <div className="kanno-sidebar-section">
          <p className="kanno-sidebar-label">ツール</p>
          <button type="button" className={`kanno-side-btn${tool === "select" ? " active" : ""}`} onClick={() => setTool("select")}>
            <span className="kanno-side-icon">↖</span><span className="kanno-side-text">選択</span><span className="kanno-side-shortcut">S</span>
          </button>
          <button type="button" className={`kanno-side-btn${tool === "box" ? " active" : ""}`} onClick={() => setTool("box")}>
            <span className="kanno-side-icon">⬜</span><span className="kanno-side-text">BBox</span><span className="kanno-side-shortcut">B</span>
          </button>
        </div>

        <div className="kanno-sidebar-section">
          <p className="kanno-sidebar-label">クラス</p>
          {regionClsList.map((c, i) => (
            <button
              key={c}
              type="button"
              className={`kanno-cls-btn${selectedCls === c ? " active" : ""}`}
              style={{ "--cls-color": CLASS_COLORS[i % CLASS_COLORS.length] } as React.CSSProperties}
              onClick={() => setSelectedCls(c)}
            >
              <span className="kanno-cls-dot" />
              {c}
            </button>
          ))}
        </div>

        <div className="kanno-sidebar-section kanno-region-list-wrap">
          <p className="kanno-sidebar-label">BOX ({boxRegions.length})</p>
          <div className="kanno-region-list">
            {boxRegions.map((r, idx) => (
              <div
                key={r.id}
                className={`kanno-region-item${selectedId === r.id ? " active" : ""}`}
                style={{ "--cls-color": getColor(r.cls, regionClsList) } as React.CSSProperties}
                onClick={() => setSelectedId(r.id)}
              >
                <span className="kanno-region-dot" />
                <span className="kanno-region-name">{r.cls ?? "-"} #{idx + 1}</span>
                <span className="kanno-region-type">box</span>
              </div>
            ))}
          </div>
        </div>

        {selectedId && (
          <button
            type="button"
            className="kanno-delete-btn"
            onClick={() => {
              updateRegions((prev) => prev.filter((r) => r.id !== selectedId));
              setSelectedId(null);
            }}
          >
            選択を削除 (Del)
          </button>
        )}
      </div>

      <div className="kanno-main">
        <div className="kanno-topbar">
          <div className="kanno-topbar-left">
            <span className="kanno-img-name">{imgIdx + 1} / {allImages.length} - {currentImg.name}</span>
          </div>
          <div className="kanno-topbar-right">
            <motion.button type="button" className="kanno-nav-btn" disabled={imgIdx === 0} onClick={() => setImgIdx((v) => Math.max(v - 1, 0))}>前</motion.button>
            <motion.button type="button" className="kanno-nav-btn" disabled={imgIdx === allImages.length - 1} onClick={() => setImgIdx((v) => Math.min(v + 1, allImages.length - 1))}>次</motion.button>
            <motion.button type="button" className="kanno-save-btn" onClick={() => onSave(allImages)}>保存して閉じる</motion.button>
            <motion.button type="button" className="kanno-close-btn" onClick={onClose}>x</motion.button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="kanno-canvas-wrap"
          style={{ cursor: tool === "box" ? "crosshair" : "default", position: "relative" }}
        >
          <div ref={stageHostRef} style={{ position: "absolute", inset: 0 }} />
          {!konvaReady && <div className="kanno-loading" style={{ position: "absolute", inset: 0 }}>Konva を読み込み中...</div>}
        </div>

        <div className="kanno-statusbar">
          {tool === "box" ? "BBox モード: 画像上をドラッグして矩形を作成" : "選択モード: BOX をクリックして選択"}
          <span style={{ marginLeft: "auto", opacity: 0.45, fontSize: "0.75rem" }}>
            canvas {canvasSize.w.toFixed(0)}x{canvasSize.h.toFixed(0)} | image {viewport.w.toFixed(0)}x{viewport.h.toFixed(0)}
          </span>
        </div>
      </div>
    </div>
  );
}
