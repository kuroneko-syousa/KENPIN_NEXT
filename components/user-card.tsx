/**
 * ユーザー情報カードコンポーネント
 * 
 * 機能:
 * - ユーザー名とメールアドレスを表示
 * - ログアウトボタンを表示
 * 
 * 注記:
 * - 現在はサイドバーから削除되었지만、将来的に再利用可能
 */
"use client";

import { SignOutButton } from "@/components/sign-out-button";

type Props = {
  userName: string;
  userEmail: string;
};

export function UserCard({ userName, userEmail }: Props) {
  return (
    <div className="sidebar-card user-card">
      <p className="card-label">ログイン中</p>
      <strong>{userName}</strong>
      <p>{userEmail}</p>
      <SignOutButton />
    </div>
  );
}