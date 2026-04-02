import { authOptions } from "@/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/?callbackUrl=/dashboard");
  }

  return (
    <DashboardShell
      userName={session.user.name ?? "Kenpin Admin"}
      userEmail={session.user.email ?? "admin@kenpin.ai"}
    >
      {children}
    </DashboardShell>
  );
}
