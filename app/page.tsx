/**
 * ログインページ（ホームページ）
 * 
 * 機能:
 * - セッオン確認：既にログイン済みの場合は /dashboard へリダイレクト
 * - ログインフォームを表示
 * - Kenpin Studio の紹介・特徴を表示
 * 
 * 処理フロー:
 * 1. getServerSession() でサーバーサイドセッションを取得
 * 2. セッションが存在すれば /dashboard へリダイレクト
 * 3. なければログインページを表示
 */
import { authOptions } from "@/auth";
import { LoginShell } from "@/components/login-shell";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ callbackUrl?: string }>;
}) {
  // サーバーサイドでセッション情報を取得
  const session = await getServerSession(authOptions);
  const params = searchParams ? await searchParams : undefined;
  const callbackUrl = params?.callbackUrl ?? "/dashboard";

  // セッションが存在（ログイン済み）の場合、ダッシュボードへリダイレクト
  if (session?.user) {
    redirect("/dashboard");
  }

  return <LoginShell callbackUrl={callbackUrl} />;
}
