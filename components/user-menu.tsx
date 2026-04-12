/**
 * ユーザーメニュー コンポーネント
 * 
 * 機能:
 * - ヘッダーに表示されるユーザープロフィール情報
 * - クリックでポップオーバーメニューを表示・非表示
 * - メニュー項目：プロフィール設定、UIデザイン変更、ログアウト
 * - 画面外クリックでメニュー自動クローズ
 * 
 * 拡張性:
 * menuItems 配列に項目を追加することで、簡単に機能を拡張可能
 */
"use client";

import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
import { useT } from "@/lib/i18n";

type UserMenuItemType = "action" | "divider";

interface UserMenuItem {
  id: string;
  type: UserMenuItemType;
  label?: string;
  icon?: string;
  onClick?: () => void;
  className?: string;
}

export function UserMenu({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();

  // メニューアイテムの定義（拡張可能な構造）
  const menuItems: UserMenuItem[] = [
    {
      id: "profile",
      type: "action",
      label: t.user_profile,
      icon: "user",
      onClick: () => {
        setOpen(false);
      },
    },
    {
      id: "theme",
      type: "action",
      label: t.user_ui,
      icon: "palette",
      onClick: () => {
        setOpen(false);
      },
    },
    {
      id: "divider1",
      type: "divider",
    },
    {
      id: "logout",
      type: "action",
      label: t.user_signout,
      icon: "sign-out",
      onClick: () => signOut({ callbackUrl: "/" }),
      className: "menu-item-logout",
    },
  ];

  // クリック外判定: ドキュメント全体のクリックを監視してメニューを閉じる
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // ref.current（メニュー要素）の外をクリックした場合、メニューを閉じる
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    // イベントリスナーを登録
    document.addEventListener("click", handleClick);
    // クリーンアップ: コンポーネント削除時にリスナーを削除
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-info"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <div className="user-avatar">
          {userName?.charAt(0).toUpperCase()}
        </div>
        <div className="user-text">
          <span className="user-name">{userName}</span>
          <span className="user-email">{userEmail}</span>
        </div>
      </button>

      {open && (
        <div className="user-dropdown" role="menu">
          <div className="user-dropdown-header">
            <div className="user-avatar-large">
              {userName?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="user-name-large">{userName}</div>
              <div className="user-email-large">{userEmail}</div>
            </div>
          </div>

          <div className="user-dropdown-divider" />

          <div className="user-dropdown-content">
            {menuItems.map((item) => {
              if (item.type === "divider") {
                return (
                  <div key={item.id} className="user-dropdown-divider" />
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`user-dropdown-item ${item.className || ""}`}
                  onClick={item.onClick}
                  role="menuitem"
                >
                  {item.icon && (
                    <span className={`menu-icon menu-icon-${item.icon}`} />
                  )}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}