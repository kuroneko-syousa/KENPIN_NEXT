/**
 * Providers コンポーネント
 * 
 * 機能:
 * - NextAuth.js の SessionProvider を統偋
 * - 全ページコンポーネントをキャッチ（サーバーガバナンス）で控出
 * - 全ページで NextAuth のセッション情報を使用行勯
 */
"use client";

import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
