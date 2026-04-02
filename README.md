# Kenpin Studio

画像系 AI モデルの作成管理を想定した Next.js + TypeScript の Web アプリです。

## 現在の構成

- `NextAuth.js` の credentials 認証
- `Prisma 7 + SQLite` によるユーザーDB土台
- ログイン後のみアクセスできる `/dashboard`
- サイドバーから移動できる詳細編集画面
- ワークスペース、モデル、画像DB、ジョブの管理 UI

## 起動方法

```bash
npm install
npm run prisma:generate
npm run prisma:push
npm run dev
```

ブラウザで `http://localhost:3000` を開くと確認できます。

## ユーザーDB

- DB ファイル: `prisma/dev.db`
- Prisma 設定: `prisma/schema.prisma`, `prisma.config.ts`
- Prisma Client: `generated/prisma`

初期ユーザーを入れる場合:

```bash
npm run prisma:seed-users
```

## デモログイン

- Email: `admin@kenpin.ai`
- Password: `demo1234`

## 次に広げやすい機能

- NextAuth と Prisma User の接続
- ワークスペースの DB 永続化
- ユーザー権限管理
- 前処理、アノテーション、YOLO 学習ジョブの永続化
