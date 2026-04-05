"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Stage, Layer, Image as KonvaImage, Rect, Circle, Line, Text, Group } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { AnnotateImage, AnyRegion, DrawTool } from "../types/annotate";
export type { DrawTool } from "../types/annotate";

export type KonvaAnnotatorProps = {
  images: AnnotateImage[];
  currentIndex?: number;
  regionClsList: string[];
  defaultTool?: DrawTool;
  onSave: (updated: AnnotateImage[]) => void;
  onClose: () => void;
};

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

const TOOLS: { id: DrawTool; icon: string; label: string; shortcut: string }[] = [
  { id: "select",  icon: "↖",  label: "選択",             shortcut: "S" },
  { id: "box",     icon: "⬜",  label: "バウンディングボックス", shortcut: "B" },
  { id: "polygon", icon: "🔷", label: "ポリゴン",           shortcut: "P" },
  { id: "point",   icon: "⚬",  label: "ポイント",           shortcut: "D" },
];

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
  const [imgDir, setImgDir] = useState<1 | -1>(1); // スライド方向
  const [tool, setTool] = useState<DrawTool>(defaultTool);
  const [selectedCls, setSelectedCls] = useState<string>(regionClsList[0] ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draftBox, setDraftBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [draftPoly, setDraftPoly] = useState<Array<[number, number]>>([]);
  const [konvaImg, setKonvaImg] = useState<HTMLImageElement | null>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 1, h: 1 });
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [flashId, setFlashId] = useState<string | null>(null); // 描画確定フラッシュ
  const stageRef = useRef<import("konva/lib/Stage").Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentImg = allImages[imgIdx];
  const regions = currentImg?.regions ?? [];

  const scale = useMemo(() => {
    if (imgNaturalSize.w <= 1 || imgNaturalSize.h <= 1) return 1;
    if (canvasSize.w <= 0 || canvasSize.h <= 0) return 1;
    return Math.min(canvasSize.w / imgNaturalSize.w, canvasSize.h / imgNaturalSize.h, 1);
  }, [canvasSize.w, canvasSize.h, imgNaturalSize.w, imgNaturalSize.h]);

  /* コンテナサイズ */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setCanvasSize({ w: rect.width, h: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* 画像ロード */
  useEffect(() => {
    if (!currentImg?.src) { setKonvaImg(null); setImgNaturalSize({ w: 1, h: 1 }); return; }
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      setKonvaImg(img);
      setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => { if (!cancelled) console.error("[KonvaAnnotator] load error:", currentImg.name); };
    img.src = currentImg.src;
    return () => { cancelled = true; img.onload = null; img.onerror = null; };
  }, [currentImg?.src]);

  const toNorm = useCallback(
    (px: number, py: number) => ({ nx: px / (imgNaturalSize.w * scale), ny: py / (imgNaturalSize.h * scale) }),
    [imgNaturalSize, scale]
  );
  const toCanvas = useCallback(
    (nx: number, ny: number) => ({ cx: nx * imgNaturalSize.w * scale, cy: ny * imgNaturalSize.h * scale }),
    [imgNaturalSize, scale]
  );

  const updateRegions = useCallback(
    (fn: (prev: AnyRegion[]) => AnyRegion[]) => {
      setAllImages((prev) => prev.map((img, i) => i === imgIdx ? { ...img, regions: fn(img.regions) } : img));
    },
    [imgIdx]
  );

  const flash = (id: string) => { setFlashId(id); setTimeout(() => setFlashId(null), 350); };

  /* 画像移動 */
  const goTo = (next: number) => {
    setImgDir(next > imgIdx ? 1 : -1);
    setImgIdx(next);
    setSelectedId(null);
    setKonvaImg(null);
  };

  /* マウスイベント */
  const getPointer = (e: KonvaEventObject<MouseEvent>) => {
    const pos = stageRef.current?.getPointerPosition();
    return pos ?? { x: 0, y: 0 };
  };

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (tool === "select") {
      if (e.target === e.target.getStage() || e.target.getClassName() === "Image") setSelectedId(null);
      return;
    }
    const { x, y } = getPointer(e);
    if (tool === "box") { setDrawing(true); setDraftBox({ x, y, w: 0, h: 0 }); }
    else if (tool === "point") {
      const { nx, ny } = toNorm(x, y);
      const id = generateId();
      updateRegions((prev) => [...prev, { type: "point", id, cls: selectedCls, x: nx, y: ny } as AnyRegion]);
      flash(id);
    }
    else if (tool === "polygon") setDraftPoly((prev) => [...prev, [x, y]]);
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (tool === "box" && drawing && draftBox) {
      const { x, y } = getPointer(e);
      setDraftBox((prev) => prev && { ...prev, w: x - prev.x, h: y - prev.y });
    }
  };

  const handleMouseUp = () => {
    if (tool === "box" && drawing && draftBox) {
      setDrawing(false);
      const { x, y, w, h } = draftBox;
      if (Math.abs(w) < 5 || Math.abs(h) < 5) { setDraftBox(null); return; }
      const rx = w < 0 ? x + w : x; const ry = h < 0 ? y + h : y;
      const { nx: nx1, ny: ny1 } = toNorm(rx, ry);
      const { nx: nx2, ny: ny2 } = toNorm(rx + Math.abs(w), ry + Math.abs(h));
      const id = generateId();
      updateRegions((prev) => [...prev, { type: "box", id, cls: selectedCls, x: nx1, y: ny1, w: nx2 - nx1, h: ny2 - ny1 } as AnyRegion]);
      setDraftBox(null);
      flash(id);
    }
  };

  const handleDblClick = () => {
    if (tool === "polygon" && draftPoly.length >= 3) {
      const norm = draftPoly.map(([px, py]) => { const { nx, ny } = toNorm(px, py); return [nx, ny] as [number, number]; });
      const id = generateId();
      updateRegions((prev) => [...prev, { type: "polygon", id, cls: selectedCls, points: norm } as AnyRegion]);
      setDraftPoly([]);
      flash(id);
    }
  };

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    updateRegions((prev) => prev.filter((r) => r.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, updateRegions]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
      if (e.key === "Escape") { setDraftPoly([]); setDrawing(false); setDraftBox(null); }
      if (e.key === "s" || e.key === "S") { setTool("select"); setDraftPoly([]); }
      if (e.key === "b" || e.key === "B") { setTool("box"); setDraftPoly([]); }
      if (e.key === "p" || e.key === "P") { setTool("polygon"); setDraftPoly([]); }
      if (e.key === "d" || e.key === "D") { setTool("point"); setDraftPoly([]); }
      if (e.key === "ArrowRight" && imgIdx < allImages.length - 1) goTo(imgIdx + 1);
      if (e.key === "ArrowLeft"  && imgIdx > 0)                    goTo(imgIdx - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteSelected, imgIdx, allImages.length]);

  const imgW = imgNaturalSize.w * scale;
  const imgH = imgNaturalSize.h * scale;
  const slideVariants = {
    enter: (dir: number) => ({ x: dir * 60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:  (dir: number) => ({ x: dir * -60, opacity: 0 }),
  };

  return (
    <div className="kanno-root">

      {/* ─── 左サイドバー ─── */}
      <div className="kanno-sidebar">
        {/* ツール */}
        <div className="kanno-sidebar-section">
          <p className="kanno-sidebar-label">ツール</p>
          {TOOLS.map((t) => (
            <motion.button
              key={t.id}
              type="button"
              className={`kanno-side-btn${tool === t.id ? " active" : ""}`}
              title={`${t.label} (${t.shortcut})`}
              onClick={() => { setTool(t.id); setDraftPoly([]); setDraftBox(null); }}
              whileHover={{ scale: 1.08, x: 3 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              <span className="kanno-side-icon">{t.icon}</span>
              <span className="kanno-side-text">{t.label}</span>
              <span className="kanno-side-shortcut">{t.shortcut}</span>
            </motion.button>
          ))}
        </div>

        {/* クラス */}
        <div className="kanno-sidebar-section">
          <p className="kanno-sidebar-label">クラス</p>
          {regionClsList.map((c, i) => (
            <motion.button
              key={c}
              type="button"
              className={`kanno-cls-btn${selectedCls === c ? " active" : ""}`}
              style={{ "--cls-color": CLASS_COLORS[i % CLASS_COLORS.length] } as React.CSSProperties}
              onClick={() => setSelectedCls(c)}
              whileHover={{ scale: 1.05, x: 3 }}
              whileTap={{ scale: 0.93 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              <span className="kanno-cls-dot" />
              {c}
            </motion.button>
          ))}
        </div>

        {/* リージョン一覧 */}
        <div className="kanno-sidebar-section kanno-region-list-wrap">
          <p className="kanno-sidebar-label">リージョン ({regions.length})</p>
          <div className="kanno-region-list">
            <AnimatePresence initial={false}>
              {regions.map((r, idx) => (
                <motion.div
                  key={r.id}
                  className={`kanno-region-item${selectedId === r.id ? " active" : ""}`}
                  style={{ "--cls-color": getColor(r.cls, regionClsList) } as React.CSSProperties}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12, height: 0, marginBottom: 0, padding: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => { setTool("select"); setSelectedId(r.id); }}
                >
                  <span className="kanno-region-dot" />
                  <span className="kanno-region-name">{r.cls ?? "—"} #{idx + 1}</span>
                  <span className="kanno-region-type">{r.type}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* 選択削除 */}
        <AnimatePresence>
          {selectedId && (
            <motion.button
              type="button"
              className="kanno-delete-btn"
              onClick={deleteSelected}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
            >
              🗑 選択を削除 (Del)
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ─── メインエリア ─── */}
      <div className="kanno-main">

        {/* トップバー */}
        <div className="kanno-topbar">
          <div className="kanno-topbar-left">
            <AnimatePresence mode="wait">
              <motion.span
                key={imgIdx}
                className="kanno-img-name"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.18 }}
              >
                {imgIdx + 1} / {allImages.length} — {currentImg?.name}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="kanno-topbar-right">
            <motion.button
              type="button" className="kanno-nav-btn"
              disabled={imgIdx === 0}
              onClick={() => goTo(imgIdx - 1)}
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.93 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >← 前</motion.button>
            <motion.button
              type="button" className="kanno-nav-btn"
              disabled={imgIdx === allImages.length - 1}
              onClick={() => goTo(imgIdx + 1)}
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.93 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >次 →</motion.button>
            <motion.button
              type="button" className="kanno-save-btn"
              onClick={() => onSave(allImages)}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >💾 保存して閉じる</motion.button>
            <motion.button
              type="button" className="kanno-close-btn"
              onClick={onClose}
              whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 18 }}
            >✕</motion.button>
          </div>
        </div>

        {/* キャンバス */}
        <div
          ref={containerRef}
          className="kanno-canvas-wrap"
          style={{ cursor: tool === "select" ? "default" : "crosshair" }}
        >
          {/* 画像切り替えアニメーション */}
          <AnimatePresence mode="wait" custom={imgDir}>
            <motion.div
              key={imgIdx}
              custom={imgDir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: "easeOut" }}
              style={{ position: "absolute", inset: 0 }}
            >
              {!konvaImg && currentImg?.src && (
                <div className="kanno-loading">画像を読み込み中...</div>
              )}
              <Stage
                ref={stageRef}
                width={canvasSize.w}
                height={canvasSize.h}
                style={{ display: "block" }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onDblClick={handleDblClick}
              >
                <Layer>
                  {konvaImg && <KonvaImage image={konvaImg} x={0} y={0} width={imgW} height={imgH} />}

                  {regions.map((r) => {
                    const color = getColor(r.cls, regionClsList);
                    const isSelected = r.id === selectedId;
                    const isFlash   = r.id === flashId;
                    const sw = isSelected ? 2.5 : 1.5;
                    const fill = isFlash ? color + "88" : color + "33";
                    const onClick = () => tool === "select" && setSelectedId(r.id);

                    if (r.type === "box") {
                      const { cx, cy } = toCanvas(r.x, r.y);
                      const w = r.w * imgNaturalSize.w * scale;
                      const h = r.h * imgNaturalSize.h * scale;
                      return (
                        <Group key={r.id} onClick={onClick}>
                          <Rect x={cx} y={cy} width={w} height={h} stroke={color} strokeWidth={sw} fill={fill} />
                          {r.cls && <Text x={cx + 3} y={cy + 3} text={r.cls} fill={color} fontSize={11} fontStyle="bold" />}
                        </Group>
                      );
                    }
                    if (r.type === "polygon") {
                      const pts = r.points.flatMap(([nx, ny]) => { const { cx, cy } = toCanvas(nx, ny); return [cx, cy]; });
                      return (
                        <Group key={r.id} onClick={onClick}>
                          <Line points={pts} closed stroke={color} strokeWidth={sw} fill={fill} />
                          {r.cls && pts.length >= 2 && <Text x={pts[0]} y={pts[1] - 14} text={r.cls} fill={color} fontSize={11} fontStyle="bold" />}
                        </Group>
                      );
                    }
                    if (r.type === "point") {
                      const { cx, cy } = toCanvas(r.x, r.y);
                      return (
                        <Group key={r.id} onClick={onClick}>
                          <Circle x={cx} y={cy} radius={isSelected ? 7 : isFlash ? 9 : 5} fill={color} stroke="#fff" strokeWidth={1.5} />
                          {r.cls && <Text x={cx + 8} y={cy - 8} text={r.cls} fill={color} fontSize={11} fontStyle="bold" />}
                        </Group>
                      );
                    }
                    return null;
                  })}

                  {draftBox && drawing && (
                    <Rect
                      x={draftBox.w < 0 ? draftBox.x + draftBox.w : draftBox.x}
                      y={draftBox.h < 0 ? draftBox.y + draftBox.h : draftBox.y}
                      width={Math.abs(draftBox.w)} height={Math.abs(draftBox.h)}
                      stroke={getColor(selectedCls, regionClsList)} strokeWidth={1.5}
                      dash={[6, 3]} fill={getColor(selectedCls, regionClsList) + "22"}
                    />
                  )}

                  {draftPoly.length > 0 && (
                    <>
                      <Line points={draftPoly.flatMap(([px, py]) => [px, py])} stroke={getColor(selectedCls, regionClsList)} strokeWidth={1.5} dash={[6, 3]} />
                      {draftPoly.map(([px, py], i) => <Circle key={i} x={px} y={py} radius={4} fill={getColor(selectedCls, regionClsList)} />)}
                    </>
                  )}
                </Layer>
              </Stage>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ステータスバー */}
        <div className="kanno-statusbar">
          <AnimatePresence mode="wait">
            <motion.span
              key={tool}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {tool === "select"  && "↖ 選択モード — クリックでリージョン選択 / Delete で削除"}
              {tool === "box"     && "⬜ BBoxモード — ドラッグで矩形を描画"}
              {tool === "polygon" && `🔷 ポリゴンモード — クリックで頂点追加 / ダブルクリックで確定${draftPoly.length > 0 ? ` (${draftPoly.length}点)` : ""}`}
              {tool === "point"   && "⚬ ポイントモード — クリックで追加"}
            </motion.span>
          </AnimatePresence>
          <span style={{ marginLeft: "auto", opacity: 0.4, fontSize: "0.75rem" }}>
            {canvasSize.w.toFixed(0)}×{canvasSize.h.toFixed(0)} | scale {scale.toFixed(2)} | ←→キーで移動
          </span>
        </div>

      </div>
    </div>
  );
}

