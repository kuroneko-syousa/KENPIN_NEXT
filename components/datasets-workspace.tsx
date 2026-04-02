"use client";

import { useState } from "react";
import { datasets } from "@/lib/dashboard-data";

export function DatasetsWorkspace() {
  const [selectedId, setSelectedId] = useState(datasets[0].id);
  const selectedDataset = datasets.find((dataset) => dataset.id === selectedId) ?? datasets[0];

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
                className={selectedId === dataset.id ? "selection-card active" : "selection-card"}
                onClick={() => setSelectedId(dataset.id)}
              >
                <strong>{dataset.name}</strong>
                <span>{dataset.images.toLocaleString()} images</span>
                <span>{dataset.quality}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Dataset Detail</p>
              <h3>{selectedDataset.name}</h3>
            </div>
            <span className="status draft">{selectedDataset.quality}</span>
          </div>

          <form className="editor-form">
            <label>
              Dataset Name
              <input defaultValue={selectedDataset.name} />
            </label>
            <label>
              Owner
              <input defaultValue={selectedDataset.owner} />
            </label>
            <label>
              Image Count
              <input defaultValue={selectedDataset.images} />
            </label>
            <label>
              Split Ratio
              <input defaultValue={selectedDataset.split} />
            </label>
            <label className="full-span">
              Caption Policy
              <textarea defaultValue={selectedDataset.captionPolicy} rows={4} />
            </label>
            <label className="full-span">
              Quality Notes
              <textarea
                defaultValue={`Quality tier: ${selectedDataset.quality}\nReview cadence: weekly`}
                rows={5}
              />
            </label>
            <div className="form-actions full-span">
              <button type="button">データセット設定を保存</button>
              <button type="button" className="ghost-button">
                検証ジョブを実行
              </button>
            </div>
          </form>
        </article>
      </section>
    </div>
  );
}
