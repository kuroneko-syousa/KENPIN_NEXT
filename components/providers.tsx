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
import { LanguageProvider } from "@/lib/i18n";

const UI_STORAGE_KEY = "kenpin-ui-settings";

const VALID_THEMES = ["dark", "light", "midnight", "forest", "rose"];
const VALID_FONT_SIZES = ["xs", "small", "medium", "large", "xl"];
const VALID_BG_STYLES = ["default", "aurora", "sunset", "ocean", "minimal"];

function applyInitialUiSettings() {
  try {
    const raw = window.localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) {
      document.body.dataset.theme = "dark";
      document.documentElement.dataset.fontSize = "medium";
      return;
    }
    const parsed = JSON.parse(raw) as { theme?: string; fontSize?: string; bg?: string };
    document.body.dataset.theme = VALID_THEMES.includes(parsed.theme ?? "")
      ? parsed.theme!
      : "dark";
    document.documentElement.dataset.fontSize = VALID_FONT_SIZES.includes(parsed.fontSize ?? "")
      ? parsed.fontSize!
      : "medium";
    const bg = VALID_BG_STYLES.includes(parsed.bg ?? "") ? parsed.bg! : "default";
    if (bg !== "default") {
      document.body.dataset.bg = bg;
    }
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
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    </LanguageProvider>
  );
}
