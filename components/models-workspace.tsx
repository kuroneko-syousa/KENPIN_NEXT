"use client";

import { useState } from "react";
import { models } from "@/lib/dashboard-data";

export function ModelsWorkspace() {
  const [selectedId, setSelectedId] = useState(models[0].id);
  const selectedModel = models.find((model) => model.id === selectedId) ?? models[0];

  return (
    <div className="workspace-content">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">Models</p>
          <h2>モデル定義と学習設定</h2>
          <p className="muted">
            左でモデルを選ぶと、右側で学習パラメータや運用メモを編集できる構成です。
          </p>
        </div>
      </section>

      <section className="detail-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Registry</p>
              <h3>モデル一覧</h3>
            </div>
          </div>
          <div className="selection-list">
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                className={selectedId === model.id ? "selection-card active" : "selection-card"}
                onClick={() => setSelectedId(model.id)}
              >
                <strong>{model.name}</strong>
                <span>{model.baseModel}</span>
                <span>{model.status}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Editor</p>
              <h3>{selectedModel.name}</h3>
            </div>
            <span className="status ready">{selectedModel.version}</span>
          </div>

          <form className="editor-form">
            <label>
              Model Name
              <input defaultValue={selectedModel.name} />
            </label>
            <label>
              Owner
              <input defaultValue={selectedModel.owner} />
            </label>
            <label>
              Base Model
              <input defaultValue={selectedModel.baseModel} />
            </label>
            <label>
              Dataset
              <input defaultValue={selectedModel.dataset} />
            </label>
            <label>
              Resolution
              <input defaultValue={selectedModel.resolution} />
            </label>
            <label>
              Learning Rate
              <input defaultValue={selectedModel.learningRate} />
            </label>
            <label>
              Training Steps
              <input defaultValue={selectedModel.steps} />
            </label>
            <label className="full-span">
              Prompt Bias
              <textarea defaultValue={selectedModel.promptBias} rows={5} />
            </label>
            <label className="full-span">
              Tags
              <input defaultValue={selectedModel.tags.join(", ")} />
            </label>
            <div className="form-actions full-span">
              <button type="button">変更を保存</button>
              <button type="button" className="ghost-button">
                学習ジョブへ送る
              </button>
            </div>
          </form>
        </article>
      </section>
    </div>
  );
}
