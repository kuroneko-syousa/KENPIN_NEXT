import { authOptions } from "@/auth";
import { DashboardOverview } from "@/components/dashboard-overview";
import { getServerSession } from "next-auth";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  return (
    <DashboardOverview
      userName={session?.user?.name ?? "ゲスト"}
      userEmail={session?.user?.email ?? ""}
      userRole={session?.user?.role ?? "User"}
    />
  );
}
