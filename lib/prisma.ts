/**
 * Prisma ORM クライアント設定
 * 
 * 機能:
 * - SQLite データベースを控出
 * - BetterSQLite3 アダプターを使用（高速データベース接続）
 * - 開発環境ではエラー、警告ログを表示
 * - Singleton パターンを使用（複数の PrismaClient を防ぐ）
 */
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
