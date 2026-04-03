# KENPIN_NEXT

**Kenpin Studio** — 画像系 AI モデルの運用管理を安全にチームで行うための Web アプリケーションです。

## 主な機能

- **Model Registry** — LoRA / fine-tune / 推論向けモデルを整理・管理
- **Job Tracking** — GPU キュー、進捗、レビュー待ちを継続監視
- **Team Access** — NextAuth.js によるセキュアな認証・アクセス制御
- **Dataset Management** — データセット品質チェックと一元管理
- **Image Database** — 複数の画像DB接続と管理
- **Workspace Organization** — ユーザー / ワークスペース単位での管理（Prisma 7 + SQLite）

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
