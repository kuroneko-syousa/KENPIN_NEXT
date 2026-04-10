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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 0,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
