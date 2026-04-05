import { datasets, imageDatabases, jobs, models } from "@/lib/dashboard-data";

type Props = {
  userName: string;
  userEmail: string;
  userRole: string;
};

export function DashboardOverview({ userName, userEmail, userRole }: Props) {
  const dateStr = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const runningJobs = jobs.filter((j) => j.stage === "Running");
  const reviewJobs = jobs.filter((j) => j.stage === "Review");
  const activeJobs = [...runningJobs, ...reviewJobs];
  const queuedJobs = jobs.filter((j) => j.stage === "Queued");

  const readyModels = models.filter((m) => m.status === "Ready");
  const trainingModels = models.filter((m) => m.status === "Training");

  const connectedDbs = imageDatabases.filter((db) => db.status === "Connected");
  const totalImages = datasets.reduce((sum, d) => sum + d.images, 0);

  return (
    <div className="workspace-content">
      {/* ─── グリーティングヒーロー ─── */}
      <section className="overview-hero panel">
        <div className="overview-greeting">
          <p className="eyebrow">ダッシュボード · {dateStr}</p>
          <h2>おかえり、{userName} さん</h2>
          <p className="muted">
            {userEmail}
            {userRole && userRole !== "User" && (
              <> &nbsp;·&nbsp; <span className="overview-role-badge">{userRole}</span></>
            )}
          </p>
        </div>

        <div className="overview-stats">
          <div className="overview-stat-chip">
            <span>実行中ジョブ</span>
            <strong>{runningJobs.length}</strong>
          </div>
          <div className="overview-stat-chip">
            <span>Ready モデル</span>
            <strong>{readyModels.length}</strong>
          </div>
          <div className="overview-stat-chip">
            <span>接続済み DB</span>
            <strong>{connectedDbs.length}</strong>
          </div>
          <div className="overview-stat-chip">
            <span>総画像数</span>
            <strong>{totalImages.toLocaleString()}</strong>
          </div>
        </div>
      </section>

      {/* ─── アクティブジョブ ＋ モデル状況 ─── */}
      <section className="detail-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">進行中</p>
              <h3>アクティブジョブ</h3>
            </div>
            {queuedJobs.length > 0 && (
              <span className="status draft">{queuedJobs.length} Queued</span>
            )}
          </div>

          <div className="metric-stack overview-card-stack">
            {activeJobs.length === 0 ? (
              <p className="muted">現在実行中のジョブはありません</p>
            ) : (
              activeJobs.map((job) => (
                <div key={job.id} className="job-card">
                  <div className="job-header">
                    <strong>{job.modelName}</strong>
                    <span className={`status ${job.stage === "Running" ? "training" : "ready"}`}>
                      {job.stage}
                    </span>
                  </div>
                  <div className="progress-bar large">
                    <div style={{ width: `${job.progress}%` }} />
                  </div>
                  <div className="job-footer">
                    <span>{job.progress}% 完了</span>
                    <span>ETA: {job.eta}</span>
                  </div>
                  <p className="muted" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
                    {job.gpu} &nbsp;·&nbsp; 優先度: {job.priority}
                  </p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">モデル</p>
              <h3>モデル状況</h3>
            </div>
            <span className="status training">{trainingModels.length} 学習中</span>
          </div>

          <div className="metric-stack overview-card-stack">
            {models.map((model) => {
              const linkedJob = jobs.find((j) => j.modelName === model.name);
              return (
                <div key={model.id} className="job-card">
                  <div className="job-header">
                    <div>
                      <strong>{model.name}</strong>
                      <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                        {model.baseModel} &nbsp;·&nbsp; {model.version}
                      </p>
                    </div>
                    <span className={`status ${model.status.toLowerCase()}`}>
                      {model.status}
                    </span>
                  </div>
                  {model.status === "Training" && linkedJob && (
                    <>
                      <div className="progress-bar" style={{ marginTop: "0.75rem" }}>
                        <div style={{ width: `${linkedJob.progress}%` }} />
                      </div>
                      <div className="job-footer">
                        <span>{linkedJob.progress}% 完了</span>
                        <span>ETA: {linkedJob.eta}</span>
                      </div>
                    </>
                  )}
                  <p className="muted" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
                    {model.dataset}
                  </p>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      {/* ─── データセット ＋ DB接続状態 ─── */}
      <section className="detail-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">データ</p>
              <h3>データセット</h3>
            </div>
            <span className="muted">{datasets.length} 件</span>
          </div>

          <div className="metric-stack overview-card-stack">
            {datasets.map((dataset) => (
              <div key={dataset.id} className="summary-item">
                <strong>{dataset.name}</strong>
                <div className="overview-meta-row">
                  <span>{dataset.images.toLocaleString()} 枚</span>
                  <span>{dataset.quality}</span>
                  <span>{dataset.owner}</span>
                </div>
                <span style={{ fontSize: "0.78rem", color: "rgba(237,241,250,0.55)" }}>
                  Split {dataset.split}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">接続</p>
              <h3>画像 DB 接続状態</h3>
            </div>
            <span className="status ready">{connectedDbs.length} オンライン</span>
          </div>

          <div className="metric-stack overview-card-stack">
            {imageDatabases.map((db) => {
              const statusClass =
                db.status === "Connected"
                  ? "ready"
                  : db.status === "Read Only"
                  ? "draft"
                  : "error";
              return (
                <div key={db.id} className="summary-item">
                  <div className="overview-db-row">
                    <strong>{db.name}</strong>
                    <span className={`status ${statusClass}`}>{db.status}</span>
                  </div>
                  <span>{db.engine} &nbsp;·&nbsp; {db.region}</span>
                  <span>{db.imageCount.toLocaleString()} 枚</span>
                </div>
              );
            })}
          </div>
        </article>
      </section>
    </div>
  );
}
