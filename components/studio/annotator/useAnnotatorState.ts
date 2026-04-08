"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnnotateImage, AnyRegion, DrawTool } from "../../../types/annotate";

export type { DrawTool };

export type AnnotatorStateReturn = ReturnType<typeof useAnnotatorState>;

export function useAnnotatorState(
  initialImages: AnnotateImage[],
  initialIndex: number,
  initialClsList: string[],
  defaultTool: DrawTool,
  onClassListChange?: (next: string[]) => void,
) {
  const [allImages, setAllImages] = useState<AnnotateImage[]>(() =>
    initialImages.map((img) => ({ ...img, regions: [...img.regions] }))
  );
  const [imgIdx, setImgIdx] = useState(initialIndex);
  const [tool, setTool] = useState<"select" | "box">(defaultTool === "select" ? "select" : "box");
  const [classList, setClassList] = useState<string[]>(() => {
    const unique = Array.from(new Set(initialClsList));
    return unique.length > 0 ? unique : ["object"];
  });
  const [selectedCls, setSelectedCls] = useState<string>(initialClsList[0] ?? "object");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // regionClsList prop が変わったとき classList を同期
  useEffect(() => {
    const unique = Array.from(new Set(initialClsList));
    if (unique.length === 0) return;
    setClassList((prev) => {
      if (prev.length === unique.length && prev.every((v, i) => v === unique[i])) return prev;
      return unique;
    });
  }, [initialClsList]);

  // 選択クラスが削除されたら先頭に戻す
  useEffect(() => {
    if (!classList.includes(selectedCls)) {
      setSelectedCls(classList[0] ?? "object");
    }
  }, [classList, selectedCls]);

  useEffect(() => {
    onClassListChange?.(classList);
  }, [classList, onClassListChange]);

  // ---- Region 操作 ----

  const updateRegions = useCallback(
    (fn: (prev: AnyRegion[]) => AnyRegion[]) => {
      setAllImages((prev) =>
        prev.map((img, i) => (i === imgIdx ? { ...img, regions: fn(img.regions) } : img))
      );
    },
    [imgIdx]
  );

  const addRegion = useCallback(
    (region: AnyRegion) => {
      updateRegions((prev) => [...prev, region]);
    },
    [updateRegions]
  );

  const deleteRegion = useCallback(
    (id: string) => {
      updateRegions((prev) => prev.filter((r) => r.id !== id));
    },
    [updateRegions]
  );

  const updateRegionById = useCallback(
    (id: string, patch: Partial<AnyRegion>) => {
      updateRegions((prev) =>
        prev.map((r) => (r.id === id ? ({ ...r, ...patch } as AnyRegion) : r))
      );
    },
    [updateRegions]
  );

  // ---- Class 操作 ----

  const addClassLabel = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      if (classList.includes(trimmed)) {
        setSelectedCls(trimmed);
        return;
      }
      setClassList((prev) => [...prev, trimmed]);
      setSelectedCls(trimmed);
    },
    [classList]
  );

  const removeClassLabel = useCallback(
    (targetCls: string) => {
      if (classList.length <= 1) return;
      const fallbackCls = classList.find((cls) => cls !== targetCls) ?? "object";
      setClassList((prev) => prev.filter((cls) => cls !== targetCls));
      if (selectedCls === targetCls) setSelectedCls(fallbackCls);
      setAllImages((prev) =>
        prev.map((img) => ({
          ...img,
          regions: img.regions.map((r) =>
            r.cls === targetCls ? { ...r, cls: fallbackCls } : r
          ),
        }))
      );
    },
    [classList, selectedCls]
  );

  // ---- 画像ナビゲーション ----

  const selectImage = useCallback((idx: number) => {
    setImgIdx(idx);
    setSelectedId(null);
  }, []);

  const goNext = useCallback(() => {
    setImgIdx((v) => Math.min(v + 1, allImages.length - 1));
    setSelectedId(null);
  }, [allImages.length]);

  const goPrev = useCallback(() => {
    setImgIdx((v) => Math.max(v - 1, 0));
    setSelectedId(null);
  }, []);

  const currentImg = allImages[imgIdx];

  return {
    // state
    allImages,
    imgIdx,
    currentImg,
    tool,
    classList,
    selectedCls,
    selectedId,
    // setters
    setTool,
    setSelectedCls,
    setSelectedId,
    // region ops
    addRegion,
    deleteRegion,
    updateRegionById,
    updateRegions,
    // class ops
    addClassLabel,
    removeClassLabel,
    // nav
    selectImage,
    goNext,
    goPrev,
  };
}
