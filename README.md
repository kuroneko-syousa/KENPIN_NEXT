# KENPIN_NEXT

**Kenpin Studio** — 画像系 AI モデルの運用管理を安全にチームで行うための Web アプリケーションです。

## 主な機能

- **Model Registry** — LoRA / fine-tune / 推論向けモデルを整理・管理
- **Job Tracking** — GPU キュー、進捗、レビュー待ちを継続監視
- **Team Access** — NextAuth.js によるセキュアな認証・アクセス制御
- **Dataset Management** — データセット品質チェックと一元管理
- **Image Database** — 複数の画像DB接続と管理
- **Workspace Organization** — ユーザー / ワークスペース単位での管理（Prisma 7 + SQLite）

## 前提環境

- Node.js 18.18 以上（推奨: Node.js 20 系）
- npm
- Windows / macOS / Linux

## セットアップ（初回）

1. 依存パッケージをインストール

```bash
npm install
```

2. 環境変数ファイルを作成

```bash
# macOS / Linux
cp .env.example .env.local

# Windows (PowerShell)
Copy-Item .env.example .env.local
```

`.env.local` の例:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-this-with-a-long-random-string
DEMO_ADMIN_EMAIL=admin@kenpin.ai
DEMO_ADMIN_PASSWORD=demo1234
DATABASE_URL="file:./prisma/dev.db"
```

3. Prisma クライアント生成と DB 反映

```bash
npm run prisma:generate
npm run prisma:push
```

4. （任意）サンプルユーザーを投入

```bash
npm run prisma:seed-users
```

## 開発サーバー起動

```bash
npm run dev
```

Windows では `start-dev.bat` でも起動できます（ローカル起動後にブラウザを開きます）。

## ログイン

デフォルトでは `.env.local` の以下の認証情報でログインできます。

- Email: `admin@kenpin.ai`
- Password: `demo1234`

必要に応じて `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` を変更してください。

## 主な npm scripts

- `npm run dev`: 開発サーバー起動
- `npm run build`: 本番ビルド
- `npm run start`: 本番サーバー起動
- `npm run lint`: ESLint 実行
- `npm run prisma:generate`: Prisma Client 生成
- `npm run prisma:push`: スキーマを DB に反映
- `npm run prisma:studio`: Prisma Studio 起動
- `npm run prisma:seed-users`: サンプルユーザー投入

## トラブルシュート

### 1) Runtime TypeError: Cannot read properties of undefined (reading 'ReactCurrentOwner')

react-konva の SSR 評価や React 内部整合性で発生することがあります。  
本プロジェクトでは react-konva を使わず、`components/konva-annotator.tsx` で konva をクライアント側 dynamic import して回避しています。

再発時は以下を順に確認してください。

- `node_modules` と `.next` を削除して再インストール
- `react`, `react-dom`, `konva` のバージョン整合性
- アノテーターで Konva Stage を state 変更のたびに再生成していないか
- 画像描画 effect が Konva 初期化完了 (`konvaReady`) 後に実行されるか

### 2) Runtime NotFoundError: Failed to execute 'removeChild' on 'Node'

React と Konva が同じ DOM ノードを更新すると発生します。  
本プロジェクトでは以下の構成で対策済みです。

- Stage は専用ホストノードに一度だけ生成
- ツール状態や viewport は ref 経由でイベントハンドラに連携
- 再レンダリングで Stage を作り直さない

### 3) 画像をインポートしても表示されない

Konva Layer 作成前に画像ロード effect が先に走ると表示されません。  
`konvaReady` を依存に含め、Konva 初期化後に画像描画 effect を再実行することで解消します。

### 4) Next.js の lockfile 警告（workspace root inferred）

親ディレクトリに別プロジェクトの lockfile がある場合に表示されます。  
動作に致命的な影響はありませんが、必要に応じて次を検討してください。

- 不要な lockfile の整理
- `next.config.ts` で `outputFileTracingRoot` を明示

## 直近の更新ログ

### 2026-04-05

- アノテーターを react-konva 依存から konva 直利用へ移行
- 画像表示、ドラッグでの BBox 描画、複数 BBox 保持を実装
- YOLO 拡張用に正規化ボックス構造を維持し、変換ヘルパーを追加
- `ReactCurrentOwner` エラー対策としてクライアント側 dynamic import 構成へ変更
- `removeChild` エラー対策として Stage の単回生成と専用ホストノードを導入
- 画像未表示不具合対策として `konvaReady` 同期で画像描画タイミングを修正

## GitHub 反映手順

1. 変更確認: `git status`
2. 差分確認: `git diff`
3. ステージ: `git add README.md components/konva-annotator.tsx`
4. コミット: `git commit -m "docs: update README and annotate Konva bugfixes"`
5. 反映: `git push origin <branch-name>`