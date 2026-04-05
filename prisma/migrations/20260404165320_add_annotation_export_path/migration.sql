-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "selectedModel" TEXT NOT NULL,
    "imageFolder" TEXT NOT NULL,
    "datasetFolder" TEXT NOT NULL,
    "databaseId" TEXT NOT NULL,
    "databaseType" TEXT NOT NULL,
    "annotationExportPath" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT NOT NULL,
    CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImageDatabaseConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "connectionType" TEXT NOT NULL,
    "mountName" TEXT NOT NULL,
    "mountPath" TEXT NOT NULL,
    "storageEngine" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "accessMode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Connected',
    "purpose" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT NOT NULL,
    CONSTRAINT "ImageDatabaseConnection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
