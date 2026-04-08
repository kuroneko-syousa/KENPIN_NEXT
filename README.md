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

Windows では PowerShell の実行ポリシーにより `npm` 実行時に `npm.ps1` がブロックされる場合があります。
その場合は次のように `npm.cmd` を使ってください。

```powershell
npm.cmd run dev
```

Windows では `start-dev.bat` でも起動できます（ローカル起動後にブラウザを開きます）。

## ログイン

デフォルトでは `.env.local` の以下の認証情報でログインできます。

- Email: `admin@kenpin.ai`
- Password: `demo1234`

必要に応じて `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` を変更してください。

## スタジオ環境の再現手順

以下の手順で、現在のスタジオ体験（前処理の視覚プレビュー + アノテーター + YOLO エクスポート）を再現できます。

1. ワークスペース作成画面で以下を設定

- 画像リソースフォルダ（入力）
- データセット/出力フォルダ（アノテーション出力先）
- タスク種別（例: 物体検出）

2. `ダッシュボード > ワークスペース > 対象ワークスペース` を開く

3. `前処理` タブ

- `設定フォルダから読み込み` で画像フォルダを読み込み
- サムネイルをクリックして対象画像を選択
- `Before / After` を見ながら以下の前処理を調整
	- **リサイズ** (320〜1024px)
	- **切り抜き** (X/Y開始・幅・高さを%指定)
	- **グレースケール** / **二値化**（閾値スライダー付き）
	- **ヒストグラム平坦化** / **エッジ強調**
	- **色調調整**（色相・彩度・明度スライダー）
	- **正規化** / **ブレ画像除外**
	- **水平フリップ** / **ランダム回転 (±15°)**
- `⚙️ 前処理設定を保存` を押下して設定をDBに保存
- 保存した設定はアノテーションタブの画像インポート時に自動適用され、**元画像は変更されない**

4. `アノテーション` タブ

- `リソースからインポート` で画像を一括読込
- インポートカード内のサンプル画像で読込結果を確認
- `アノテーターを開く` を押下

5. アノテーター画面

- 左パネルでツール選択（BBox / 選択）
- 画像上ドラッグで BBox 作成
- クラスラベルはアノテーター内で編集
	- クラス追加
	- クラス削除（最低 1 クラスは保持）
- 右サイドバーで画像サンプルと各画像の BBox 数を確認
- `保存して閉じる` でスタジオへ反映

6. アノテーションタブに戻り `YOLO フォーマットでエクスポート` を実行

- 各画像の `.txt`
- `classes.txt`

注記:

- 保存されるのはアノテーション情報（regions / name）です。画像 `src` は保存しないため、再編集時は画像の再インポートが必要です。
- 出力先はワークスペース設定のパスを自動利用します。

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

### 5) `'next' は...認識されていません` と表示される

`node_modules` 未インストール、または PowerShell で `npm.ps1` がブロックされていると発生します。  
Windows (PowerShell) では次の順で実行してください。

```powershell
npm.cmd ci
npm.cmd run dev
```

既に `node_modules` がある場合でも、再インストールで解消することがあります。

## 直近の更新ログ

### 2026-04-08

#### 前処理設定のDB保存とアノテーション時自動適用

- `Workspace` テーブルに `preprocessConfig` カラム（JSON文字列）を追加（マイグレーション: `20260408000000_add_preprocess_config`）
- 前処理タブをCanvas APIによるピクセル処理ベースに全面リニューアル
  - 対応処理: **リサイズ・切り抜き・グレースケール・二値化・ヒストグラム平坦化・エッジ強調・色調調整（色相/彩度/明度）・正規化・ブレ除外・水平フリップ・ランダム回転**
  - Before / After プレビューが設定変更のたびにリアルタイム更新（CSS フィルターではなくCanvasピクセル処理）
  - 「⚙️ 前処理設定を保存」ボタンで設定をDBに永続化
- アノテーションタブの画像インポート時に `preprocessConfig` を自動読み込み、Canvas APIで処理を適用してからアノテーターに渡す（**元画像は一切変更しない**）
- `PATCH /api/workspaces/[id]` が `preprocessConfig` の更新に対応
- `WorkspaceInfo` 型に `preprocessConfig` フィールドを追加

#### リソースアクセス登録ページの改善

- 登録済み接続先に「編集」ボタンを追加し、インライン編集フォームを実装
- 接続先の詳細表示からストレージエンジン名（`NTFS/Folder`等）を非表示に変更

#### 前処理タブのUI整理

- 「画像をインポート」ボタン（webkitdirectory）を削除し、「設定フォルダから読み込み」のみに統一

#### アノテーターのモジュール分割リファクタリング

モノリシックな `components/konva-annotator.tsx` を責務ごとに分割し、`components/studio/annotator/` 配下で管理するアーキテクチャに移行。

| ファイル | 役割 |
|---|---|
| `konva-annotator.tsx` | コンポジションルート（各モジュールを組み合わせる） |
| `studio/annotator/useAnnotatorState.ts` | 全状態（images / classList / selectedId 等）と CRUD 操作を管理するカスタムフック |
| `studio/annotator/AnnotatorCanvas.tsx` | Konva Stage/Layer + マウスイベント処理 |
| `studio/annotator/hooks/useBoxDraw.ts` | BBox ドラッグ描画の純粋ロジック（副作用なし） |
| `studio/annotator/AnnotationSidebar.tsx` | 左パネル UI（ツール選択・クラス管理・アノテーション一覧） |
| `studio/annotator/ImageListSidebar.tsx` | 右サイドバー UI（画像サンプル・BBox 数表示） |
| `studio/annotator/Topbar.tsx` | トップバー UI（ナビゲーション・保存・閉じる） |

- UI コンポーネント（Sidebar / Topbar）はステートレス（props のみ受け取る）に統一
- `useRef` を `useState` に置き換え、状態管理を整理

### 2026-04-07

- 前処理タブを視覚プレビュー対応（画像インポート、サムネイル選択、Before / After 表示）
- アノテーションのインポートカード内にサンプル画像表示を追加
- クラスラベル編集機能をスタジオページからアノテーター内部へ移動
- 右サイドバーに画像サンプルと画像ごとの BBox 数表示を追加

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
3. ステージ: `git add README.md docs/ components/konva-annotator.tsx components/studio/`
4. コミット: `git commit -m "refactor: split KonvaAnnotator into modular studio/annotator structure"`
5. 反映: `git push origin <branch-name>`