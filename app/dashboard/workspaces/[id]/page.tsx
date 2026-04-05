import { authOptions } from "@/auth";
import { WorkspaceStudio } from "@/components/workspace-studio";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

export default async function WorkspaceStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/");
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: { owner: true },
  });

  if (!workspace || workspace.owner.email !== session.user.email) {
    notFound();
  }

  return (
    <WorkspaceStudio
      workspace={{
        id: workspace.id,
        name: workspace.name,
        target: workspace.target,
        selectedModel: workspace.selectedModel,
        imageFolder: workspace.imageFolder,
        datasetFolder: workspace.datasetFolder,
        databaseId: workspace.databaseId,
        databaseType: workspace.databaseType,
        annotationExportPath: workspace.annotationExportPath ?? "",
        annotationData: workspace.annotationData ?? "[]",
        ownerName: workspace.owner.name,
        ownerEmail: workspace.owner.email,
      }}
    />
  );
}
