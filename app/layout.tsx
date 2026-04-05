/**
 * ルートレイアウト（全ページ共通）
 * 
 * 機能:
 * - HTML/Body タグの定義
 * - メタデータの設定（タイトル、説明文など）
 * - Providers コンポーネントでセッション・テーマなどのグローバル設定を適用
 * - 全ページで共有されるスタイル（globals.css）を読み込み
 */
import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kenpin Studio",
  description: "画像系AIモデルの作成・学習・管理をまとめる運用ダッシュボード",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">  
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
