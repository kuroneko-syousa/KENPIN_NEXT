import { authOptions } from "@/auth";
import { WorkspacesWorkspace } from "@/components/workspaces-workspace";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

export default async function WorkspacesPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/");
  }

  const ownWorkspaces = await prisma.workspace.findMany({
    where: {
      owner: {
        email: session.user.email,
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    include: {
      owner: true,
    },
  });

  return (
    <WorkspacesWorkspace
      currentUserEmail={session.user.email}
      currentUserName={session.user.name ?? "User"}
      initialWorkspaces={ownWorkspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        ownerId: workspace.ownerId,
        ownerName: workspace.owner.name,
        ownerEmail: workspace.owner.email,
        target: workspace.target,
        selectedModel: workspace.selectedModel,
        imageFolder: workspace.imageFolder,
        datasetFolder: workspace.datasetFolder,
        databaseId: workspace.databaseId,
        databaseType: workspace.databaseType,
        steps: [],
      }))}
    />
  );
}
