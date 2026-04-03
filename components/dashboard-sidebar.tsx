/**
 * ダッシュボードサイドバー
 * 
 * 機能:
 * - キeャクユリアックス機能（概要、ワークスペース、画像DB など）
 * - サイドバーの開閉を制御
 * - 現会ページを強調表示（ナビゲーション active 状況）
 * - サイドバー収納時はアイコンのみ表示
 */
"use client";

import { navItems } from "@/lib/dashboard-data";
import Link from "next/link";
import { usePathname } from "next/navigation";

type DashboardSidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
};

function NavGlyph({ icon }: { icon: string }) {
  switch (icon) {
    case "overview":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4" width="7" height="7" rx="2" />
          <rect x="14" y="4" width="7" height="4" rx="2" />
          <rect x="14" y="11" width="7" height="9" rx="2" />
          <rect x="3" y="14" width="7" height="6" rx="2" />
        </svg>
      );
    case "models":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 4 7.5 12 12l8-4.5L12 3Z" />
          <path d="M4 11.5 12 16l8-4.5" />
          <path d="M4 15.5 12 20l8-4.5" />
        </svg>
      );
    case "datasets":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
          <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        </svg>
      );
    case "jobs":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2v4" />
          <path d="M12 18v4" />
          <path d="M4.9 4.9l2.8 2.8" />
          <path d="M16.3 16.3l2.8 2.8" />
          <path d="M2 12h4" />
          <path d="M18 12h4" />
          <path d="M4.9 19.1l2.8-2.8" />
          <path d="M16.3 7.7l2.8-2.8" />
          <circle cx="12" cy="12" r="3.5" />
        </svg>
      );
    case "image-db":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4" width="18" height="14" rx="3" />
          <circle cx="9" cy="9" r="1.8" />
          <path d="m7 15 3.5-3.5L14 15l2.5-2.5L20 16" />
          <path d="M7 20h10" />
        </svg>
      );
    case "workspaces":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4" width="8" height="7" rx="2" />
          <rect x="13" y="4" width="8" height="7" rx="2" />
          <rect x="3" y="13" width="8" height="7" rx="2" />
          <path d="M15 13h6" />
          <path d="M15 16h6" />
          <path d="M15 19h4" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v3" />
          <path d="M12 18v3" />
          <path d="M4.9 4.9 7 7" />
          <path d="M17 17l2.1 2.1" />
          <path d="M3 12h3" />
          <path d="M18 12h3" />
          <path d="M4.9 19.1 7 17" />
          <path d="M17 7l2.1-2.1" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
      );
  }
}

export function DashboardSidebar({
  collapsed,
  onToggle,
}: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={collapsed ? "workspace-sidebar collapsed" : "workspace-sidebar"}>
      <div className="sidebar-topbar">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          aria-label={collapsed ? "サイドバーを展開" : "サイドバーを収納"}
          aria-expanded={!collapsed}
        >
          <span className="toggle-rail" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className={collapsed ? "toggle-arrow collapsed" : "toggle-arrow"} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="m15 6-6 6 6 6" />
            </svg>
          </span>
        </button>
      </div>

      <div className="sidebar-brand">
        <p className="eyebrow">AI スタジオ</p>
        <h1>KENPIN_NEXT</h1>
        <p className="muted">
          KENPIN NEXTは、画像AIの構築から学習、運用管理までを一貫して支える統合ワークスペースです。
        </p>
      </div>

      <nav className="nav-list" aria-label="Dashboard Navigation">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "nav-item active" : "nav-item"}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-icon" aria-hidden="true">
                <NavGlyph icon={item.icon} />
              </span>
              <div className="nav-copy">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </div>
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
