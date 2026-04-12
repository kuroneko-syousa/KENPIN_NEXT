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
import { useEffect, useState } from "react";

const UI_STORAGE_KEY = "kenpin-ui-settings";

function applyInitialUiSettings() {
  try {
    const raw = window.localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) {
      document.body.dataset.theme = "dark";
      document.documentElement.dataset.fontSize = "medium";
      return;
    }
    const parsed = JSON.parse(raw) as { theme?: string; fontSize?: string };
    document.body.dataset.theme = parsed.theme === "light" ? "light" : "dark";
    document.documentElement.dataset.fontSize =
      parsed.fontSize === "small" || parsed.fontSize === "large"
        ? parsed.fontSize
        : "medium";
  } catch {
    document.body.dataset.theme = "dark";
    document.documentElement.dataset.fontSize = "medium";
  }
}

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

  useEffect(() => {
    applyInitialUiSettings();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
