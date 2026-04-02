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
          <p className="eyebrow">Image DB</p>
          <h2>Select a database and browse images</h2>
          <p className="muted">
            Pick a connection from the dropdown, then review the stored images and their metadata.
          </p>
        </div>
      </section>

      <section className="panel db-toolbar-panel">
        <div className="db-toolbar">
          <label className="db-control">
            Database connection
            <select value={databaseId} onChange={(event) => setDatabaseId(event.target.value)}>
              {imageDatabases.map((database) => (
                <option key={database.id} value={database.id}>
                  {database.name} ({database.status})
                </option>
              ))}
            </select>
          </label>

          <label className="db-control">
            Search images
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by image name, tag, or dataset"
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
              <span>Engine</span>
            </div>
            <div className="metric-row">
              <strong>{selectedDatabase.region}</strong>
              <span>Region</span>
            </div>
            <div className="metric-row">
              <strong>{selectedDatabase.imageCount.toLocaleString()}</strong>
              <span>Stored images</span>
            </div>
            <div className="metric-row">
              <strong>{selectedDatabase.updatedAt}</strong>
              <span>Last sync</span>
            </div>
          </div>

          <p className="muted block-copy">{selectedDatabase.description}</p>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Browser</p>
              <h3>Image browser</h3>
            </div>
            <span>{visibleImages.length} items</span>
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
              <strong>No matching images</strong>
              <span>Try a different search query or switch to another database.</span>
            </div>
          )}
        </article>
      </section>

      {selectedImage ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Inspector</p>
              <h3>{selectedImage.name}</h3>
            </div>
            <span className="status ready">{selectedImage.format}</span>
          </div>

          <div className="inspector-layout">
            <img src={selectedImage.preview} alt={selectedImage.name} className="inspector-preview" />

            <div className="editor-form inspector-form">
              <label>
                Image ID
                <input defaultValue={selectedImage.id} />
              </label>
              <label>
                Dataset
                <input defaultValue={selectedImage.dataset} />
              </label>
              <label>
                Resolution
                <input defaultValue={selectedImage.resolution} />
              </label>
              <label>
                Created At
                <input defaultValue={selectedImage.createdAt} />
              </label>
              <label className="full-span">
                Tags
                <input defaultValue={selectedImage.tags.join(", ")} />
              </label>
              <label className="full-span">
                Prompt
                <textarea defaultValue={selectedImage.prompt} rows={5} />
              </label>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
