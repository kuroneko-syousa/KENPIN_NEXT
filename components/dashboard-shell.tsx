/**
 * ダッシュボードシェル（ページレイアウト）
 * 
 * 機能:
 * - サイドバーを詳めることができる空間を作成
 * - サイドバーの開閉体江を管理
 * - ヘッダーにユーザーメニューを表示
 * - collapsed 状況に応じてダッシュボードのレイアウトを変更
 */
"use client";

import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { useState, useEffect } from "react";
import { UserMenu } from "@/components/user-menu"; // 追加

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

  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  return (
    <div className={collapsed ? "workspace-shell collapsed" : "workspace-shell"}>
      <DashboardSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((current) => !current)}
      />
      <main className="workspace-main">
        <div className="workspace-header-bar">
          <UserMenu userName={userName} userEmail={userEmail} />
        </div>
        {children}
      </main>
    </div>
  );
}
