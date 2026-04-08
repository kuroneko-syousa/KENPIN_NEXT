# Data Model

## Prisma スキーマ（実装済み）

### User

| フィールド | 型 | 説明 |
|---|---|---|
| id | String (cuid) | PK |
| name | String | 表示名 |
| email | String (unique) | メールアドレス |
| role | String | `admin` / `user` |
| team | String | チーム名 |
| createdAt | DateTime | 作成日時 |
| updatedAt | DateTime | 更新日時 |
| workspaces | Workspace[] | リレーション |
| imageDatabases | ImageDatabaseConnection[] | リレーション |

### Workspace

| フィールド | 型 | 説明 |
|---|---|---|
| id | String (cuid) | PK |
| name | String | ワークスペース名 |
| target | String | タスク種別（物体検出など） |
| selectedModel | String | 選択モデル |
| imageFolder | String | 画像リソースフォルダパス |
| datasetFolder | String | 出力フォルダパス |
| databaseId | String | 接続DB ID |
| databaseType | String | DB種別 |
| annotationExportPath | String | YOLO エクスポート先パス |
| annotationData | String | アノテーションJSON（`AnnotateImage[]`） |
| preprocessConfig | String | 前処理設定JSON（`PreprocessConfig`） |
| status | String | `draft` / `active` など |
| ownerId | String | FK → User |

### ImageDatabaseConnection

| フィールド | 型 | 説明 |
|---|---|---|
| id | String (cuid) | PK |
| name | String | 接続名 |
| connectionType | String | 接続種別 |
| mountName | String | マウント名 |
| mountPath | String | マウントパス |
| storageEngine | String | ストレージエンジン |
| endpoint | String | エンドポイント |
| accessMode | String | アクセスモード |
| status | String | `Connected` / `Read Only` / `Error` |
| purpose | String | 用途 |
| notes | String | メモ |
| imageCount | Int | 総画像数 |
| ownerId | String | FK → User |

---

## アノテーション型（`types/annotate.ts`）

```ts
type BoxRegion   = { type: "box";     id: string; cls?: string; x: number; y: number; w: number; h: number };
type PolyRegion  = { type: "polygon"; id: string; cls?: string; points: Array<[number, number]> };
type PointRegion = { type: "point";   id: string; cls?: string; x: number; y: number };
type AnyRegion   = BoxRegion | PolyRegion | PointRegion;

type AnnotateImage = {
  src: string;
  name: string;
  regions: AnyRegion[];
};

type DrawTool = "select" | "box" | "polygon" | "point";
```

座標系はすべて **正規化座標（0.0〜1.0）** で管理。YOLO フォーマットへの変換は `boxRegionToYoloLine()` で行う。

---

## モックデータ（ダッシュボード表示用）

ダッシュボード概要カードはモックデータで動作（`lib/dashboard-data.ts`）。
将来的に実APIへ移行予定。

モックモデル: Job / Model / Dataset / ImageDatabase（表示専用）
