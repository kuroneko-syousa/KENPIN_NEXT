"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnnotateImage, DrawTool } from "../types/annotate";
import { importImages, getRootFolderLabel } from "../lib/annotation/importImages";
import { exportYOLOZip } from "../lib/annotation/exportYOLO";
import { applyPreprocessToDataUrl, DEFAULT_CONFIG, type PreprocessConfig } from "../lib/preprocess/applyPreprocess";

export type AnnotationIssue = {
  level: "error" | "warning";
  message: string;
};

export type AnnotationStats = {
  total: number;
  annotated: number;
  unannotated: number;
  classCounts: Record<string, number>;
  issues: AnnotationIssue[];
};

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

  // DB の AnnotationEntry テーブルからアノテーションを復元（新方式）
  // フォールバック: workspace.annotationData JSON blob（旧方式）
  // imageFolder が設定されている場合は後述の自動インポートが兼任するためスキップ
  useEffect(() => {
    if (workspace.imageFolder) return;
    let cancelled = false;
    const restore = async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspace.id}/annotations`);
        if (!res.ok) throw new Error("fetch failed");
        const { entries } = (await res.json()) as {
          entries: { imageName: string; regions: string }[];
        };

        if (cancelled) return;

        if (entries.length > 0) {
          const savedData: AnnotateImage[] = entries.map((e) => ({
            src: "",
            name: e.imageName,
            regions: (() => {
              try { return JSON.parse(e.regions); } catch { return []; }
            })(),
          }));
          setImages(savedData);
          const annotated = savedData.filter((img) => img.regions.length > 0).length;
          setRestoreInfo(
            `アノテーションデータを復元しました（${annotated}枚）。リソースから再インポートすると画像が表示されます`
          );
          setTimeout(() => setRestoreInfo(null), 6000);
          return;
        }
      } catch {
        // AnnotationEntry 取得失敗時は旧 JSON blob にフォールバック
      }

      // 旧方式フォールバック
      try {
        const savedData: AnnotateImage[] = JSON.parse(workspace.annotationData || "[]");
        if (cancelled || savedData.length === 0) return;
        setImages(savedData);
        const annotated = savedData.filter((img) => img.regions.length > 0).length;
        setRestoreInfo(
          `アノテーションデータを復元しました（${annotated}枚）。リソースから再インポートすると画像が表示されます`
        );
        setTimeout(() => setRestoreInfo(null), 6000);
      } catch {
        // 無視
      }
    };
    void restore();
    return () => { cancelled = true; };
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

  const annotationStats = useMemo((): AnnotationStats => {
    const total = images.length;
    const annotated = images.filter((img) => img.regions.length > 0).length;
    const unannotated = total - annotated;

    // クラス別リージョン数カウント
    const classCounts: Record<string, number> = {};
    for (const img of images) {
      for (const r of img.regions) {
        const cls = r.cls ?? "(未設定)";
        classCounts[cls] = (classCounts[cls] ?? 0) + 1;
      }
    }

    const issues: AnnotationIssue[] = [];

    // クラスリストに存在しないクラス名のリージョン → エクスポート時スキップ
    const unknownClasses = new Set<string>();
    for (const img of images) {
      for (const r of img.regions) {
        if (!r.cls) {
          unknownClasses.add("(未設定)");
        } else if (!regionClsList.includes(r.cls)) {
          unknownClasses.add(r.cls);
        }
      }
    }
    if (unknownClasses.size > 0) {
      issues.push({
        level: "error",
        message: `未登録クラスのリージョンがあります: ${[...unknownClasses].join("、")}。エクスポート時にスキップされ、ラベルファイルが不完全になります。`,
      });
    }

    // データなし画像 → 空ラベルファイル生成（学習データとして無効）
    if (unannotated > 0 && total > 0) {
      issues.push({
        level: "warning",
        message: `${unannotated} 枚の画像にアノテーションがありません。空のラベルファイルが生成され、学習効率が低下します。`,
      });
    }

    // クラスリストに定義されているがリージョンが0のクラス → データ不均衡
    if (total > 0) {
      const unusedClasses = regionClsList.filter((cls) => !classCounts[cls]);
      if (unusedClasses.length > 0) {
        issues.push({
          level: "warning",
          message: `クラス「${unusedClasses.join("、")}」にリージョンが0件です。classes.txt と実データが不一致になります。`,
        });
      }
    }

    return { total, annotated, unannotated, classCounts, issues };
  }, [images, regionClsList]);

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

  // アノテーター保存 → state 更新 + AnnotationEntry テーブルへ永続化
  const handleAnnotationSave = useCallback(
    async (updated: AnnotateImage[]) => {
      setImages(updated);
      setAnnotatorOpen(false);

      const entries = updated.map((img) => ({
        imageName: img.name,
        regions: JSON.stringify(img.regions),
      }));

      try {
        const res = await fetch(`/api/workspaces/${workspace.id}/annotations`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => res.status.toString());
          console.error("[useAnnotation] annotationEntries の保存に失敗しました", text);
        }
      } catch (err) {
        console.error("[useAnnotation] annotationEntries の保存に失敗しました", err);
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

  const handleResourceImport = useCallback(async () => {
    try {
      // 画像リスト + 保存済みアノテーションを並列取得
      const [imgRes, annRes] = await Promise.all([
        fetch(`/api/workspaces/${workspace.id}/images`),
        fetch(`/api/workspaces/${workspace.id}/annotations`),
      ]);

      if (!imgRes.ok) {
        const err = await imgRes.json().catch(() => ({ error: imgRes.statusText }));
        console.error("[useAnnotation] リソースインポート失敗", err);
        return;
      }

      const imgData = (await imgRes.json()) as {
        images: { name: string; src: string }[];
        folder: string;
        total: number;
      };

      // 保存済みアノテーションをマップに
      const entryMap = new Map<string, string>();
      if (annRes.ok) {
        const { entries } = (await annRes.json()) as {
          entries: { imageName: string; regions: string }[];
        };
        for (const e of entries) {
          entryMap.set(e.imageName, e.regions);
        }
      }

      let preprocessCfg: PreprocessConfig | null = null;
      try {
        const parsed = JSON.parse(workspace.preprocessConfig || "{}");
        if (Object.keys(parsed).length > 0) {
          preprocessCfg = { ...DEFAULT_CONFIG, ...parsed };
        }
      } catch {
        // 不正な JSON は無視
      }

      const imported: AnnotateImage[] = await Promise.all(
        imgData.images.map(async ({ name, src: rawSrc }) => {
          const src = preprocessCfg
            ? await applyPreprocessToDataUrl(rawSrc, preprocessCfg)
            : rawSrc;
          // DB にあればそのリージョンを使用、なければ既存 images から探す
          const savedRegions = entryMap.get(name);
          const regions = savedRegions
            ? (() => { try { return JSON.parse(savedRegions); } catch { return []; } })()
            : (images.find((img) => img.name === name)?.regions ?? []);
          return { src, name, regions };
        })
      );

      setImages(imported);
      setAnnotatorOpen(false);
      setImportSourceLabel(`${imgData.folder} (${imgData.total} 枚)`);
    } catch (err) {
      console.error("[useAnnotation] リソースインポート失敗", err);
    }
  }, [workspace.id, workspace.preprocessConfig, images]);

  const handleExportYOLOZip = useCallback(async () => {
    await exportYOLOZip(images, regionClsList);
  }, [images, regionClsList]);

  // ワークスペース起動時に imageFolder が設定されていれば自動インポート（画像 + アノテーション）
  useEffect(() => {
    if (!workspace.imageFolder) return;
    void handleResourceImport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once

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
    annotationStats,
    handleAnnotationSave,
    handleFolderUpload,
    handleResourceImport,
    handleExportYOLOZip,
  };
}
