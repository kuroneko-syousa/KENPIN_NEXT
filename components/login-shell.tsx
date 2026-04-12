"use client";

import { LoginForm } from "./login-form";
import { LoginTransition } from "./login-transition";
import { useT } from "@/lib/i18n";

type LoginShellProps = {
  callbackUrl: string;
};

export function LoginShell({ callbackUrl }: LoginShellProps) {
  return (
    <LoginTransition>
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
    </LoginTransition>
  );
}
