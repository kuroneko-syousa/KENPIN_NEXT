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
import { useT } from "@/lib/i18n";

type LoginFormProps = {
  callbackUrl: string;
};

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState("admin@kenpin.ai");
  const [password, setPassword] = useState("demo1234");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (!result || result.error || !result.url) {
        setError(t.login_err_fail);
        setIsSubmitting(false);
        return;
      }

      router.push(result.url);
      router.refresh();
    } catch {
      setError(t.login_err_exc);
      setIsSubmitting(false);
    }
  };

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label>
        {t.login_email}
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@kenpin.ai"
          required
        />
      </label>

      <label>
        {t.login_password}
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
        <span>{t.login_remember}</span>
      </label>

      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t.login_submitting : t.login_submit}
      </button>
    </form>
  );
}
