/**
 * 画像DB管理ページ
 * 
 * 機能:
 * - 画像DB接続一覧をそート（ドロップダウン）で選択
 * - 画像検索機能（画像名、タグ、データセットをキーワード検索）
 * - 画像グリッド表示（サムネイル一覧）
 * - 画像インスペクタで蘋備挿開情報を控毯
 */
"use client";

import { imageDatabases } from "@/lib/dashboard-data";
import { useMemo, useState } from "react";

export function ImageDatabaseWorkspace() {
  const [databaseId, setDatabaseId] = useState(imageDatabases[0].id);
  const [query, setQuery] = useState("");

  const selectedDatabase =
    imageDatabases.find((database) => database.id === databaseId) ?? imageDatabases[0];

  const visibleImages = useMemo(() => {
    return selectedDatabase.images.filter((image) => {
      const lowerQuery = query.toLowerCase();
      return (
        image.name.toLowerCase().includes(lowerQuery) ||
        image.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
        image.dataset.toLowerCase().includes(lowerQuery)
      );
    });
  }, [query, selectedDatabase]);

  const selectedImage = visibleImages[0] ?? selectedDatabase.images[0];

  return (
    <div className="workspace-content">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">画像DB</p>
          <h2>データベースを選択して画像を閲覧</h2>
          <p className="muted">
            ドロップダウンから接続を選び、保存されている画像とメタデータを確認できます。
          </p>
        </div>
      </section>

      <section className="panel db-toolbar-panel">
        <div className="db-toolbar">
          <label className="db-control">
            データベース接続
            <select value={databaseId} onChange={(event) => setDatabaseId(event.target.value)}>
              {imageDatabases.map((database) => (
                <option key={database.id} value={database.id}>
                  {database.name} ({database.status})
                </option>
              ))}
            </select>
          </label>

          <label className="db-control">
            画像を検索
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="画像名、タグ、またはデータセットで検索"
            />
          </label>
        </div>
      </section>

      <section className="detail-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Connection</p>
              <h3>{selectedDatabase.name}</h3>
            </div>
            <span
              className={
                selectedDatabase.status === "Connected"
                  ? "status ready"
                  : selectedDatabase.status === "Read Only"
                    ? "status draft"
                    : "status error"
              }
            >
              {selectedDatabase.status}
            </span>
          </div>

          <div className="metric-stack">
            <div className="metric-row">
              <strong>{selectedDatabase.engine}</strong>
              <span>エンジン</span>
            </div>
            <div className="metric-row">
              <strong>{selectedDatabase.region}</strong>
              <span>地域</span>
            </div>
            <div className="metric-row">
              <strong>{selectedDatabase.imageCount.toLocaleString()}</strong>
              <span>保存済みの画像</span>
            </div>
            <div className="metric-row">
              <strong>{selectedDatabase.updatedAt}</strong>
              <span>最後の同期</span>
            </div>
          </div>

          <p className="muted block-copy">{selectedDatabase.description}</p>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ブラウザ</p>
              <h3>画像ブラウザ</h3>
            </div>
            <span>{visibleImages.length} 件</span>
          </div>

          {visibleImages.length > 0 ? (
            <div className="image-grid">
              {visibleImages.map((image) => (
                <div key={image.id} className="image-card">
                  <img src={image.preview} alt={image.name} className="image-preview" />
                  <div className="image-meta">
                    <strong>{image.name}</strong>
                    <span>{image.resolution}</span>
                    <span>{image.tags.join(", ")}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>一致する画像がありません</strong>
              <span>別の検索クエリを試すか、別のデータベースに切り替えてください。</span>
            </div>
          )}
        </article>
      </section>

      {selectedImage ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">インスペクタ</p>
              <h3>{selectedImage.name}</h3>
            </div>
            <span className="status ready">{selectedImage.format}</span>
          </div>

          <div className="inspector-layout">
            <img src={selectedImage.preview} alt={selectedImage.name} className="inspector-preview" />

            <div className="editor-form inspector-form">
              <label>
                画像ID
                <input defaultValue={selectedImage.id} />
              </label>
              <label>
                データセット
                <input defaultValue={selectedImage.dataset} />
              </label>
              <label>
                解像度
                <input defaultValue={selectedImage.resolution} />
              </label>
              <label>
                作成日時
                <input defaultValue={selectedImage.createdAt} />
              </label>
              <label className="full-span">
                タグ
                <input defaultValue={selectedImage.tags.join(", ")} />
              </label>
              <label className="full-span">
                プロンプト
                <textarea defaultValue={selectedImage.prompt} rows={5} />
              </label>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
