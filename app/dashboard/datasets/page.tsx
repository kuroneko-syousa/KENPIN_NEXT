import { DatasetsWorkspace } from "@/components/datasets-workspace";
import { prisma } from "@/lib/prisma";

export default async function DatasetsPage() {
  const workspaces = await prisma.workspace.findMany({
    select: {
      id: true,
      name: true,
      databaseId: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const databaseIds = Array.from(
    new Set(workspaces.map((workspace) => workspace.databaseId).filter((value) => value.trim() !== ""))
  );

  const connections = databaseIds.length
    ? await prisma.imageDatabaseConnection.findMany({
        where: {
          id: {
            in: databaseIds,
          },
        },
        select: {
          id: true,
          name: true,
        },
      })
    : [];

  const connectionNameMap = new Map(connections.map((connection) => [connection.id, connection.name]));

  return (
    <DatasetsWorkspace
      initialWorkspaceOptions={workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        resourceId: workspace.databaseId,
        resourceName: connectionNameMap.get(workspace.databaseId) ?? null,
      }))}
    />
  );
}
