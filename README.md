# KENPIN_NEXT

画像系 AI モデルの作成と管理を行う Next.js ベースの Web アプリです。

## 主な機能

- NextAuth.js によるログイン認証
- Prisma 7 + SQLite によるユーザー / ワークスペース管理
- 画像 DB 選択と閲覧 UI
- ワークスペース作成と管理 UI
- 画像前処理、アノテーション、YOLO 学習へつながる管理導線

## セットアップ

```bash
npm install
npm run prisma:generate
npm run prisma:push
npm run dev
```

ブラウザで `http://localhost:3000` を開いて確認できます。

## 開発用ログイン

- Email: `admin@kenpin.ai`
- Password: `demo1234`

## データベース

- Prisma schema: `prisma/schema.prisma`
- Prisma config: `prisma.config.ts`
- SQLite DB: `prisma/dev.db`

初期ユーザーを投入する場合:

```bash
npm run prisma:seed-users
```

## 今後の拡張候補

- NextAuth と Prisma User の本格連携
- ワークスペース設定の永続化拡張
- 画像処理 / アノテーション / 学習ジョブの実処理接続
