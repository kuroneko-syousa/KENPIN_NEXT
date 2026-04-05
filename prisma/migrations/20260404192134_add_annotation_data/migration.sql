-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "selectedModel" TEXT NOT NULL,
    "imageFolder" TEXT NOT NULL,
    "datasetFolder" TEXT NOT NULL,
    "databaseId" TEXT NOT NULL,
    "databaseType" TEXT NOT NULL,
    "annotationExportPath" TEXT NOT NULL DEFAULT '',
    "annotationData" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT NOT NULL,
    CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Workspace" ("annotationExportPath", "createdAt", "databaseId", "databaseType", "datasetFolder", "id", "imageFolder", "name", "ownerId", "selectedModel", "status", "target", "updatedAt") SELECT "annotationExportPath", "createdAt", "databaseId", "databaseType", "datasetFolder", "id", "imageFolder", "name", "ownerId", "selectedModel", "status", "target", "updatedAt" FROM "Workspace";
DROP TABLE "Workspace";
ALTER TABLE "new_Workspace" RENAME TO "Workspace";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
