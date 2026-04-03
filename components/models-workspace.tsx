/**
 * モデル管理ページ
 * 
 * 機能:
 * - 組み辞めモデル一覧を表示
 * - 会拡張をクリックして㖮_承試策を設定・編集
 * - モデル名、ベースモデル、学習率、タグなどを会議可能
 * - 【適】 一方へ送り挏ボタンで学習ジョブを开始
 */
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
              モデル名
              <input defaultValue={selectedModel.name} />
            </label>
            <label>
              所有者
              <input defaultValue={selectedModel.owner} />
            </label>
            <label>
              ベースモデル
              <input defaultValue={selectedModel.baseModel} />
            </label>
            <label>
              データセット
              <input defaultValue={selectedModel.dataset} />
            </label>
            <label>
              解像度
              <input defaultValue={selectedModel.resolution} />
            </label>
            <label>
              学習率
              <input defaultValue={selectedModel.learningRate} />
            </label>
            <label>
              学習ステップ数
              <input defaultValue={selectedModel.steps} />
            </label>
            <label className="full-span">
              プロンプトバイアス
              <textarea defaultValue={selectedModel.promptBias} rows={5} />
            </label>
            <label className="full-span">
              タグ
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
