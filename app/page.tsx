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
import { LoginForm } from "@/components/login-form";
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

  return (
    <main className="login-shell">
      <section className="login-hero">
        <p className="eyebrow">Kenpin Studio</p>
        <h1>画像系 AI モデル運用を、安全にチームで回すための入口です。</h1>
        <p className="muted login-copy">
          モデル登録、学習ジョブ監視、データセット品質チェックを一つの管理基盤で扱えます。
          現在は NextAuth.js の credentials 認証をつないであり、ログイン後は保護された管理画面へ移動します。
        </p>

        <div className="login-highlights">
          <div className="highlight-card">
            <strong>Model Registry</strong>
            <p>LoRA / fine-tune / 推論向けモデルを整理</p>
          </div>
          <div className="highlight-card">
            <strong>Team Access</strong>
            <p>認証後だけ設定編集へ入れる構成に変更済み</p>
          </div>
          <div className="highlight-card">
            <strong>Job Tracking</strong>
            <p>GPU キュー、進捗、レビュー待ちを継続監視</p>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="login-card-header">
            <p className="eyebrow">Sign In</p>
            <h2>管理画面にログイン</h2>
            <p className="muted">
              デモ用初期値: <code>admin@kenpin.ai</code> / <code>demo1234</code>
            </p>
          </div>

          <LoginForm callbackUrl={callbackUrl} />
        </div>
      </section>
    </main>
  );
}
