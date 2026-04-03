// ========================================
// NextAuth.js の認証設定ファイル
// ========================================
// このファイルでは、ユーザーのログイン・ログアウト・セッション管理を設定しています。
// 本番環境では、安全なデータベース認証に置き換える必要があります。

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

// デモ用のログイン認証情報（本番環境では環境変数から読み込む）
const demoEmail = process.env.DEMO_ADMIN_EMAIL ?? "admin@kenpin.ai";
const demoPassword = process.env.DEMO_ADMIN_PASSWORD ?? "demo1234";

// NextAuth.js の設定オプション
// セッション管理、ユーザー認証、ページリダイレクトなどを定義
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET ?? "dev-secret-change-me",
  // JWT（JSON Web Token）をセッション管理の方式として使用
  session: {
    strategy: "jwt",
  },
  // ブラウザを閉じたらセッションを失うようにクッキー設定
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        // maxAge を設定しないことでセッションクッキーになる
      },
    },
  },
  // ログインが必要な場合はホームページ（/）にリダイレクト
  pages: {
    signIn: "/",
  },
  // 認証プロバイダーの設定（メール・パスワード認証）
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // メールアドレスとパスワードが一致したかを検証するロジック
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;

        // デモ認証情報と一致した場合、ユーザー情報を返す
        if (email === demoEmail && password === demoPassword) {
          return {
            id: "admin-demo",
            email: demoEmail,
            name: "Kenpin Admin",
            role: "admin",
          };
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
      }
      return session;
    },
  },
};
