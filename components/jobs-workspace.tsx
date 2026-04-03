/**
 * ジョブ管理ページ
 * 
 * 機能:
 * - 学習ジョブ一覧を表示（列訜打ど）
 * - 一つを選択してGPU割り当て、优先度、再試氋を基遺
 * - 進江バーを控洓で学習進渡状弋を控詰
 */
"use client";

import { useState } from "react";
import { jobs } from "@/lib/dashboard-data";

export function JobsWorkspace() {
  const [selectedId, setSelectedId] = useState(jobs[0].id);
  const selectedJob = jobs.find((job) => job.id === selectedId) ?? jobs[0];

  return (
    <div className="workspace-content">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">Jobs</p>
          <h2>ジョブ監視と実行ポリシー</h2>
          <p className="muted">
            キューの優先度、GPU 割り当て、レビュー待ちを見ながら細かな調整を行えます。
          </p>
        </div>
      </section>

      <section className="detail-grid">
        <article className="panel">
          <div className="selection-list">
            {jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                className={selectedId === job.id ? "selection-card active" : "selection-card"}
                onClick={() => setSelectedId(job.id)}
              >
                <strong>{job.modelName}</strong>
                <span>Job #{job.id}</span>
                <span>{job.stage}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Job Detail</p>
              <h3>Job #{selectedJob.id}</h3>
            </div>
            <span className="status training">{selectedJob.stage}</span>
          </div>

          <div className="progress-bar large">
            <div style={{ width: `${selectedJob.progress}%` }} />
          </div>

          <form className="editor-form">
            <label>
              モデル
              <input defaultValue={selectedJob.modelName} />
            </label>
            <label>
              GPU割り当て
              <input defaultValue={selectedJob.gpu} />
            </label>
            <label>
              優先度
              <input defaultValue={selectedJob.priority} />
            </label>
            <label>
              予定時間
              <input defaultValue={selectedJob.eta} />
            </label>
            <label className="full-span">
              再試行ポリシー
              <textarea
                defaultValue="ワーカー障害時は最大2回まで再試行。損失が閾値を超える場合は手動レビューにエスカレート。"
                rows={5}
              />
            </label>
            <div className="form-actions full-span">
              <button type="button">ジョブ設定を更新</button>
              <button type="button" className="ghost-button">
                一時停止 / 再開
              </button>
            </div>
          </form>
        </article>
      </section>
    </div>
  );
}
