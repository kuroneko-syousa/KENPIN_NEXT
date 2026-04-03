/**
 * ログアウトボタンコンポーネント
 * 
 * 機能:
 * - NextAuth.js の signOut() を呼ぶボタン
 * - クリック時にホームページをリダイレクト
 * - ゴーストボタンスタイルを適用
 */
"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button type="button" className="ghost-button" onClick={() => signOut({ callbackUrl: "/" })}>
      ログアウト
    </button>
  );
}
