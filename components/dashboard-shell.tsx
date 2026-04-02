"use client";

import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { useState } from "react";

type DashboardShellProps = {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
};

export function DashboardShell({
  children,
  userName,
  userEmail,
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={collapsed ? "workspace-shell collapsed" : "workspace-shell"}>
      <DashboardSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((current) => !current)}
        userName={userName}
        userEmail={userEmail}
      />
      <main className="workspace-main">{children}</main>
    </div>
  );
}
