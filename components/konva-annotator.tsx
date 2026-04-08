"use client";

import { useEffect, useMemo } from "react";
import type { AnnotateImage, BoxRegion, DrawTool } from "../types/annotate";
import { useAnnotatorState } from "./studio/annotator/useAnnotatorState";
import AnnotatorCanvas from "./studio/annotator/AnnotatorCanvas";
import AnnotationSidebar from "./studio/annotator/AnnotationSidebar";
import ImageListSidebar from "./studio/annotator/ImageListSidebar";
import Topbar from "./studio/annotator/Topbar";

export type { DrawTool } from "../types/annotate";

export type KonvaAnnotatorProps = {
  images: AnnotateImage[];
  currentIndex?: number;
  regionClsList: string[];
  defaultTool?: DrawTool;
  onClassListChange?: (next: string[]) => void;
  onSave: (updated: AnnotateImage[]) => void;
  onClose: () => void;
};

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
  onClassListChange,
  onSave,
  onClose,
}: KonvaAnnotatorProps) {
  const state = useAnnotatorState(
    images,
    currentIndex,
    regionClsList,
    defaultTool,
    onClassListChange,
  );

  const {
    allImages,
    imgIdx,
    currentImg,
    tool,
    classList,
    selectedCls,
    selectedId,
    setTool,
    setSelectedCls,
    setSelectedId,
    addRegion,
    deleteRegion,
    addClassLabel,
    removeClassLabel,
    selectImage,
    goNext,
    goPrev,
  } = state;

  const boxRegions = useMemo(
    () => (currentImg?.regions ?? []).filter((r): r is BoxRegion => r.type === "box"),
    [currentImg?.regions]
  );

  // キーボードショートカット
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        deleteRegion(selectedId);
        setSelectedId(null);
      }
      if (e.key === "b" || e.key === "B") setTool("box");
      if (e.key === "s" || e.key === "S") setTool("select");
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, deleteRegion, setSelectedId, setTool, goNext, goPrev]);

  if (!currentImg) {
    return (
      <div className="kanno-root">
        <div className="kanno-loading" style={{ margin: "1.5rem" }}>画像がありません。</div>
      </div>
    );
  }

  return (
    <div className="kanno-root" style={{ display: "flex", gap: 0, height: "100vh" }}>
      <AnnotationSidebar
        tool={tool}
        classList={classList}
        selectedCls={selectedCls}
        boxRegions={boxRegions}
        selectedId={selectedId}
        regionClsList={regionClsList}
        onToolChange={setTool}
        onSelectCls={setSelectedCls}
        onAddClass={addClassLabel}
        onRemoveClass={removeClassLabel}
        onSelectRegion={setSelectedId}
        onDeleteSelected={() => {
          if (selectedId) {
            deleteRegion(selectedId);
            setSelectedId(null);
          }
        }}
      />

      <div className="kanno-main">
        <Topbar
          imgIdx={imgIdx}
          totalImages={allImages.length}
          imageName={currentImg.name}
          onPrev={goPrev}
          onNext={goNext}
          onSave={() => onSave(allImages)}
          onClose={onClose}
        />

        <AnnotatorCanvas
          image={currentImg}
          regions={currentImg.regions}
          selectedRegionId={selectedId}
          tool={tool}
          classList={classList}
          selectedCls={selectedCls}
          onAddRegion={(region) => {
            addRegion(region);
            setSelectedId(region.id);
          }}
          onSelectRegion={setSelectedId}
        />

        <div className="kanno-statusbar">
          {tool === "box" ? "BBox モード: 画像上をドラッグして矩形を作成" : "選択モード: BOX をクリックして選択"}
        </div>
      </div>

      <ImageListSidebar
        images={allImages}
        currentIndex={imgIdx}
        onSelect={selectImage}
      />
    </div>
  );
}
