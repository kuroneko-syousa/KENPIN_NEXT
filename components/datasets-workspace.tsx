/**
 * データセット管理ページ
 */
"use client";

import { useState, useEffect } from "react";
import { datasets, type Dataset } from "@/lib/dashboard-data";

type FormData = {
  name: string;
  owner: string;
  images: string;
  split: string;
  captionPolicy: string;
  notes: string;
};

const STORAGE_KEY = "kenpin_dataset_edits";

function loadSaved(): Record<number, FormData> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<number, FormData>;
  } catch {
    return {};
  }
}

function datasetToForm(dataset: Dataset): FormData {
  return {
    name: dataset.name,
    owner: dataset.owner,
    images: String(dataset.images),
    split: dataset.split,
    captionPolicy: dataset.captionPolicy,
    notes: "",
  };
}

export function DatasetsWorkspace() {
  const [selectedId, setSelectedId] = useState(datasets[0].id);
  const [saved, setSaved] = useState<Record<number, FormData>>({});
  const [form, setForm] = useState<FormData>(() => datasetToForm(datasets[0]));
  const [saveMessage, setSaveMessage] = useState("");

  const selectedDataset = datasets.find((d) => d.id === selectedId) ?? datasets[0];

  // 初回マウント時にlocalStorageから読み込み
  useEffect(() => {
    const stored = loadSaved();
    setSaved(stored);
    const initial = stored[datasets[0].id] ?? datasetToForm(datasets[0]);
    setForm(initial);
  }, []);

  // データセット切替時にフォームを更新
  const handleSelectDataset = (id: number) => {
    setSelectedId(id);
    setSaveMessage("");
    const dataset = datasets.find((d) => d.id === id) ?? datasets[0];
    setForm(saved[id] ?? datasetToForm(dataset));
  };

  const handleChange = (field: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = () => {
    const next = { ...saved, [selectedId]: form };
    setSaved(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaveMessage("保存しました");
    setTimeout(() => setSaveMessage(""), 2500);
  };

  return (
    <div className="workspace-content">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">Datasets</p>
          <h2>データセット詳細と品質設定</h2>
          <p className="muted">
            キャプション方針や分割比率を見ながら、学習データの編集方針を詰められます。
          </p>
        </div>
      </section>

      <section className="detail-grid">
        <article className="panel">
          <div className="selection-list">
            {datasets.map((dataset) => (
              <button
                key={dataset.id}
                type="button"
                className={selectedId === dataset.id ? "selection-card workspace-selection-card active" : "selection-card workspace-selection-card"}
                onClick={() => handleSelectDataset(dataset.id)}
              >
                <strong>{saved[dataset.id]?.name ?? dataset.name}</strong>
                <span>{dataset.images.toLocaleString()} images · {dataset.quality}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Dataset Detail</p>
              <h3>{form.name || selectedDataset.name}</h3>
            </div>
            <span className="status draft">{selectedDataset.quality}</span>
          </div>

          <form className="editor-form" onSubmit={(e) => e.preventDefault()}>
            <label>
              ワークスペース名
              <input value={form.name} onChange={handleChange("name")} />
            </label>
            <label>
              作成ユーザー
              <input value={form.owner} onChange={handleChange("owner")} />
            </label>
            <label>
              画像数
              <input value={form.images} onChange={handleChange("images")} />
            </label>
            <label>
              分割比率
              <input value={form.split} onChange={handleChange("split")} />
            </label>
            <label className="full-span">
              キャプション方針（テキストの説明・注釈ルール）
              <textarea value={form.captionPolicy} onChange={handleChange("captionPolicy")} rows={4} />
            </label>
            <label className="full-span">
              備考
              <textarea value={form.notes} onChange={handleChange("notes")} rows={4} placeholder="備考を入力してください" />
            </label>
            <div className="form-actions full-span">
              <button type="button" onClick={handleSave}>変更を保存</button>
              <button type="button">エクスポート</button>
              {saveMessage ? <span style={{ color: "#7cf0ba", fontSize: "0.85rem" }}>{saveMessage}</span> : null}
            </div>
          </form>
        </article>
      </section>
    </div>
  );
}
