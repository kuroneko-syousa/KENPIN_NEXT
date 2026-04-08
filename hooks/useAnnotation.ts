"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnnotateImage, DrawTool } from "../types/annotate";
import { importImages, getRootFolderLabel } from "../lib/annotation/importImages";
import { exportYOLO } from "../lib/annotation/exportYOLO";

export type UseAnnotationReturn = ReturnType<typeof useAnnotation>;

type WorkspaceAnnotationInfo = {
  id: string;
  target: string;
  imageFolder: string;
  datasetFolder: string;
  annotationExportPath: string;
  annotationData: string;
  preprocessConfig: string;
};

const defaultClasses: Record<string, string[]> = {
  "object-detection":  ["object"],
  "anomaly-detection": ["defect", "ok"],
  segmentation:        ["region"],
  "ocr-inspection":    ["text"],
  "pose-keypoint":     ["person"],
};

export const toolMap: Record<string, DrawTool> = {
  "object-detection":  "box",
  "anomaly-detection": "box",
  segmentation:        "polygon",
  "ocr-inspection":    "box",
  "pose-keypoint":     "point",
};

export function useAnnotation(workspace: WorkspaceAnnotationInfo) {
  const [images, setImages] = useState<AnnotateImage[]>([]);
  const [annotatorOpen, setAnnotatorOpen] = useState(false);
  const [regionClsList, setRegionClsList] = useState<string[]>(
    defaultClasses[workspace.target] ?? ["object"]
  );
  const [exportPath, setExportPath] = useState(
    workspace.annotationExportPath || workspace.datasetFolder || ""
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [restoreInfo, setRestoreInfo] = useState<string | null>(null);
  const [importSourceLabel, setImportSourceLabel] = useState<string>(
    workspace.imageFolder || "未選択"
  );

  // DB から保存済みアノテーションを復元
  useEffect(() => {
    try {
      const savedData: AnnotateImage[] = JSON.parse(workspace.annotationData || "[]");
      if (savedData.length === 0) return;
      setImages(savedData);
      const withSrc = savedData.filter((img) => img.src).length;
      const total = savedData.length;
      const annotated = savedData.filter((img) => img.regions.length > 0).length;
      if (withSrc === total) {
        setRestoreInfo(
          `前回のセッション (${total} 枚・${annotated} 枚アノテーション済み) を復元しました`
        );
      } else {
        setRestoreInfo(
          `アノテーションデータを復元しました（${annotated}枚）。画像を再アップロードしてください`
        );
      }
      setTimeout(() => setRestoreInfo(null), 5000);
    } catch {
      // 不正な JSON は無視
    }
  // 初回マウント時のみ
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ワークスペース設定の出力先を自動同期
  useEffect(() => {
    const preferredPath =
      workspace.annotationExportPath || workspace.datasetFolder || "";
    if (!preferredPath) return;
    setExportPath(preferredPath);
    if (workspace.annotationExportPath === preferredPath) return;
    void saveExportPath(preferredPath);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id, workspace.annotationExportPath, workspace.datasetFolder]);

  const annotatedCount = useMemo(
    () => images.filter((img) => img.regions.length > 0).length,
    [images]
  );
  const importPreviewImages = useMemo(
    () => images.filter((img) => Boolean(img.src)).slice(0, 15),
    [images]
  );

  const saveExportPath = useCallback(
    async (path: string) => {
      setSaving(true);
      setSaveError("");
      setSaved(false);
      try {
        const res = await fetch(`/api/workspaces/${workspace.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ annotationExportPath: path }),
        });
        if (!res.ok) throw new Error("save failed");
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch {
        setSaveError("登録に失敗しました。再度お試しください。");
      } finally {
        setSaving(false);
      }
    },
    [workspace.id]
  );

  // アノテーター保存 → state 更新 + DB 永続化（src は除いて保存）
  const handleAnnotationSave = useCallback(
    async (updated: AnnotateImage[]) => {
      setImages(updated);
      setAnnotatorOpen(false);
      const persisted = updated.map(({ src: _src, ...rest }) => rest);
      try {
        const res = await fetch(`/api/workspaces/${workspace.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ annotationData: JSON.stringify(persisted) }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => res.status.toString());
          console.error("[useAnnotation] annotationData の保存に失敗しました", text);
        }
      } catch (err) {
        console.error("[useAnnotation] annotationData の保存に失敗しました", err);
      }
    },
    [workspace.id]
  );

  const handleFolderUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      const label = getRootFolderLabel(files);
      const imported = await importImages(files, images, workspace.preprocessConfig);
      setImages(imported);
      setAnnotatorOpen(false);
      setImportSourceLabel(label);
      e.target.value = "";
    },
    [images, workspace.preprocessConfig]
  );

  const handleExportYOLO = useCallback(() => {
    exportYOLO(images, regionClsList);
  }, [images, regionClsList]);

  return {
    images,
    annotatorOpen,
    setAnnotatorOpen,
    regionClsList,
    setRegionClsList,
    exportPath,
    saving,
    saved,
    saveError,
    restoreInfo,
    importSourceLabel,
    annotatedCount,
    importPreviewImages,
    handleAnnotationSave,
    handleFolderUpload,
    handleExportYOLO,
  };
}
