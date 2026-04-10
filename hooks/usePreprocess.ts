"use client";

import { useCallback, useEffect, useState } from "react";
import {
  applyPreprocess,
  DEFAULT_CONFIG,
  type PreprocessConfig,
  type PreprocessResult,
} from "../lib/preprocess/applyPreprocess";

export type UsePreprocessReturn = ReturnType<typeof usePreprocess>;

export function usePreprocess(
  workspaceId: string,
  initialConfigJson: string,
  imageFolder: string,
  onConfigSaved?: (json: string) => void
) {
  const [cfg, setCfg] = useState<PreprocessConfig>(() => {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(initialConfigJson || "{}") };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  });

  const [previewImages, setPreviewImages] = useState<Array<{ name: string; src: string }>>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewSourceLabel, setPreviewSourceLabel] = useState(imageFolder || "未選択");
  const [afterResult, setAfterResult] = useState<PreprocessResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  const selectedPreview = previewImages[previewIndex] ?? null;

  // After プレビューを cfg / 選択画像が変わるたびに再生成
  useEffect(() => {
    if (!selectedPreview) {
      setAfterResult(null);
      return;
    }
    let cancelled = false;
    applyPreprocess(selectedPreview.src, cfg).then((result) => {
      if (!cancelled) setAfterResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPreview, cfg]);

  const set = useCallback(
    <K extends keyof PreprocessConfig>(key: K, value: PreprocessConfig[K]) =>
      setCfg((prev) => ({ ...prev, [key]: value })),
    []
  );

  const handleImport = useCallback(async () => {
    setImportLoading(true);
    setImportError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/images`);
      const json = await res.json();
      if (!res.ok) {
        setImportError(json.error ?? "読み込みに失敗しました");
        return;
      }
      const loaded = json.images as Array<{ name: string; src: string }>;
      setPreviewImages(loaded);
      setPreviewIndex(0);
      setPreviewSourceLabel(`${imageFolder} (${loaded.length} 枚)`);
    } catch {
      setImportError("サーバーへの接続に失敗しました");
    } finally {
      setImportLoading(false);
    }
  }, [workspaceId, imageFolder]);

  const saveConfig = useCallback(async () => {
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const json = JSON.stringify(cfg);
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preprocessConfig: json }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaved(true);
      onConfigSaved?.(json);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError("設定の保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }, [workspaceId, cfg, onConfigSaved]);

  // ワークスペース起動時に imageFolder が設定されていれば自動インポート
  useEffect(() => {
    if (!imageFolder) return;
    void handleImport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once

  return {
    cfg,
    set,
    previewImages,
    previewIndex,
    setPreviewIndex,
    previewSourceLabel,
    selectedPreview,
    afterResult,
    afterSrc: afterResult?.dataUrl ?? null,
    saving,
    saved,
    saveError,
    importLoading,
    importError,
    fullscreenOpen,
    setFullscreenOpen,
    handleImport,
    saveConfig,
  };
}
