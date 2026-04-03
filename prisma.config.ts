/**
 * Prisma 憨管理設定ファイル
 * 
 * 機能:
 * - データベース接続 URL を .env.local ファイルから読み込み
 * - Prisma スキーマを prisma/schema.prisma から控出
 */
import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

loadEnv({ path: ".env.local" });
loadEnv();

// Prisma 設定: データベーススキーマおよびデータソースを指定
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
