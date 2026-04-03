/**
 * ログインフォーム コンポーネント
 * 
 * 機能:
 * - ユーザーのメール・パスワード入力を受け取る
 * - NextAuth.js経由でサーバーに認証リクエストを送信
 * - 認証成功後、ダッシュボード画面へリダイレクト
 * - エラーメッセージを表示
 */
"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

type LoginFormProps = {
  callbackUrl: string;
};

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("admin@kenpin.ai");
  const [password, setPassword] = useState("demo1234");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // フォーム送信時のハンドラー（ログイン処理）
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // ページリロードを防ぐ
    setIsSubmitting(true); // ボタンをディセーブル
    setError(""); // 前のエラーをクリア

    // try-catch でエラーハンドリング
    try {
      // NextAuth.js の signIn() で認証リクエストを送信
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (!result || result.error || !result.url) {
        setError("ログインに失敗しました。入力内容と環境変数を確認してください。");
        setIsSubmitting(false);
        return;
      }

      router.push(result.url);
      router.refresh();
    } catch {
      setError("ログイン処理でエラーが発生しました。もう一度お試しください。");
      setIsSubmitting(false);
    }
  };

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label>
        メール
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@kenpin.ai"
          required
        />
      </label>

      <label>
        パスワード
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="demo1234"
          required
        />
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
        />
        <span>ログイン状態を保持する</span>
      </label>

      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "ログイン中..." : "ログインして続行"}
      </button>
    </form>
  );
}
