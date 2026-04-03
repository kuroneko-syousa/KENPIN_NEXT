/**
 * ダッシュボード概要ページ
 * 
 * 機能:
 * - 算数演算を使って控詰統計を計算（モデル数、珖習ジョブ数、DB接続数、画像総数）
 * - 全体的な運用状況゗複数をダッシュバルで厳示
 * - 画像を控測しる主要ダッシュボード
 */
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
          <p className="eyebrow">概要</p>
          <h2>ワークスペース ステータス</h2>
          <p className="muted">
            モデル活動、画像DB接続状態、現在の学習負荷を一つの画面で確認できます。
          </p>
        </div>

        <div className="hero-stats">
          <div className="stat-chip">
            <span>登録済みモデル</span>
            <strong>{models.length}</strong>
          </div>
          <div className="stat-chip">
            <span>学習ジョブ</span>
            <strong>{trainingCount}</strong>
          </div>
          <div className="stat-chip">
            <span>接続済みDB</span>
            <strong>{connectedDbCount}</strong>
          </div>
        </div>
      </section>

      <section className="detail-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">一目でわかる</p>
              <h3>運用スナップショット</h3>
            </div>
          </div>
          <div className="metric-stack">
            <div className="metric-row">
              <strong>{totalImages.toLocaleString()}</strong>
              <span>合計データセット画像数</span>
            </div>
            <div className="metric-row">
              <strong>{jobs[0].gpu}</strong>
              <span>アクティブなGPU割り当て</span>
            </div>
            <div className="metric-row">
              <strong>{readyCount}</strong>
              <span>デプロイ可能なモデル</span>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">データベース</p>
              <h3>画像DB接続状態</h3>
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
