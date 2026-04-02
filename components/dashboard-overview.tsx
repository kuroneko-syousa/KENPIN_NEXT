import { datasets, imageDatabases, jobs, models } from "@/lib/dashboard-data";

export function DashboardOverview() {
  const readyCount = models.filter((model) => model.status === "Ready").length;
  const trainingCount = models.filter((model) => model.status === "Training").length;
  const totalImages = datasets.reduce((sum, dataset) => sum + dataset.images, 0);
  const connectedDbCount = imageDatabases.filter((db) => db.status === "Connected").length;

  return (
    <div className="workspace-content">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>Workspace status</h2>
          <p className="muted">
            Review model activity, image database connectivity, and current training pressure from one place.
          </p>
        </div>

        <div className="hero-stats">
          <div className="stat-chip">
            <span>Registered Models</span>
            <strong>{models.length}</strong>
          </div>
          <div className="stat-chip">
            <span>Training Jobs</span>
            <strong>{trainingCount}</strong>
          </div>
          <div className="stat-chip">
            <span>Connected DBs</span>
            <strong>{connectedDbCount}</strong>
          </div>
        </div>
      </section>

      <section className="detail-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">At A Glance</p>
              <h3>Operational snapshot</h3>
            </div>
          </div>
          <div className="metric-stack">
            <div className="metric-row">
              <strong>{totalImages.toLocaleString()}</strong>
              <span>Total dataset images</span>
            </div>
            <div className="metric-row">
              <strong>{jobs[0].gpu}</strong>
              <span>Top active GPU allocation</span>
            </div>
            <div className="metric-row">
              <strong>{readyCount}</strong>
              <span>Models ready for deployment</span>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Database</p>
              <h3>Image DB connectivity</h3>
            </div>
          </div>
          <div className="selection-list">
            {imageDatabases.map((database) => (
              <div key={database.id} className="selection-card static-card">
                <strong>{database.name}</strong>
                <span>{database.engine}</span>
                <span>{database.status}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
