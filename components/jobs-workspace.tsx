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
              Model
              <input defaultValue={selectedJob.modelName} />
            </label>
            <label>
              GPU Allocation
              <input defaultValue={selectedJob.gpu} />
            </label>
            <label>
              Priority
              <input defaultValue={selectedJob.priority} />
            </label>
            <label>
              ETA
              <input defaultValue={selectedJob.eta} />
            </label>
            <label className="full-span">
              Retry Policy
              <textarea
                defaultValue="Retry up to 2 times on worker failure. Escalate to manual review if loss spikes above threshold."
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
