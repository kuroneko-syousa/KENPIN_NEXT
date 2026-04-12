# Dashboard Specification

## Overview

ダッシュボードは、AIモデル運用の全体状況を一画面で可視化するための統合ビューである。
ユーザーはログイン後、本画面に遷移し、モデル・ジョブ・データ・インフラの状態を俯瞰できる。

---

## Access Control

* 認証必須（未ログイン時は `/` にリダイレクト）
* セッションは JWT ベース
* ロールに応じた表示制御を行う

---

## Props

```ts
type Props = {
  userName: string;
  userEmail: string;
  userRole: string;
};
```

---

## Data Sources

以下のデータを元にUIを構築する：

* jobs
* models
* datasets
* imageDatabases

※ 現在はモックデータ。将来的にAPI経由で取得。

---

## Layout Structure

### 1. Hero Section（概要表示）

ユーザー情報と主要KPIを表示する。

#### 表示内容

* 日付（日本ロケール）
* ユーザー名
* メールアドレス
* ロール（admin の場合のみ表示）

#### KPI

* 実行中ジョブ数（Running）
* Ready モデル数
* 接続済みDB数
* 総画像数

---

### 2. Active Jobs（進行中ジョブ）

#### 対象

* Running
* Review

#### 表示内容

* モデル名
* ステータス
* 進捗バー（%）
* ETA
* GPU情報
* priority

#### 補足

* Queuedジョブ数も表示

---

### 3. Model Status（モデル状況）

#### 表示内容

* モデル名
* baseModel
* version
* ステータス（Training / Ready / Error）
* dataset

#### 条件表示

Training中の場合：

* 紐づくJobの進捗を表示

---

### 4. Dataset Overview（データセット）

#### 表示内容

* 名前
* 画像数
* 品質（quality）
* 所有者（owner）
* split

---

### 5. Image Database Status（DB接続）

#### 表示内容

* DB名
* ステータス

  * Connected
  * Read Only
  * Error
* エンジン
* リージョン
* 画像数

---

## Logic

### Job分類

```ts
runningJobs = jobs.filter(j => j.stage === "Running");
reviewJobs = jobs.filter(j => j.stage === "Review");
queuedJobs = jobs.filter(j => j.stage === "Queued");
```

---

### Model分類

```ts
readyModels = models.filter(m => m.status === "Ready");
trainingModels = models.filter(m => m.status === "Training");
```

---

### DB分類

```ts
connectedDbs = imageDatabases.filter(db => db.status === "Connected");
```

---

### 総画像数

```ts
totalImages = datasets.reduce((sum, d) => sum + d.images, 0);
```

---

### モデルとジョブの関連

#### 現状

```ts
jobs.find(j => j.modelName === model.name)
```

#### 推奨

```ts
job.modelId === model.id
```

---

## Future Improvements

### High Priority

* API連携（データの動的取得）
* 認証ガードの強化
* モデル詳細ページ

---

### Medium Priority

* リアルタイム更新（Polling / WebSocket）
* ジョブ詳細表示
* フィルタ・検索機能

---

### Low Priority

* アラート通知
* マルチテナント対応
* 権限制御の細分化

---

## Notes

* UIは運用者向けに設計されている
* 進捗・状態・リソースを即座に把握できることを最優先とする
* 今後の拡張に備え、データは疎結合に保つこと

---

## 学習済みモデルページ仕様（2026-04-12 更新）

### 一覧表示

* 左リストの主表示は `display_name` を使用
* `display_name` 未設定の既存データはモデルキー（例: `YOLOV8N`）を仮表示
* サブ情報として使用モデルと作成日時を表示

### 詳細表示

* モデル名の右に編集ボタン（✎）を表示
* 編集モードではインライン入力 + `保存` / `キャンセル`
* 保存時に FastAPI `PATCH /jobs/{job_id}/rename` を実行

### スタジオ連携

* スタジオの学習開始時に `モデル名（任意）` を送信
* 送信値はジョブの `display_name` として永続化され、学習済みモデル画面に反映

---

## Workspace Studio — アノテーションタブ仕様

### アノテーション状況パネル (`AnnotationStats`)

画像インポート後 / アノテーション保存後にリアルタイム更新される。

#### ドーナツチャート

| 項目 | 内容 |
|------|------|
| 表示値 | アノテーション完了率（%） |
| 実装 | SVG（ライブラリ不要） |
| 色変化 | 0%: グレー / 進行中: 青 (`#7cb4f0`) / 100%: 緑 (`#7cf0ba`) |

#### クラス別バーチャート

* `regionClsList` に登録済みの全クラスを表示
* リージョン数に応じた相対的な横棒で比較
* `regionClsList` に未登録のクラス名は赤で「⚠ {クラス名}」と表示

#### 整合性チェック

| レベル | 条件 | 学習への影響 |
|--------|------|-------------|
| 🔴 エラー | `cls` 未設定 or クラスリスト外のリージョンが存在 | エクスポート時スキップ → ラベルファイルが不完全 |
| 🟡 警告 | アノテーション0枚の画像が存在 | 空ラベルファイルが生成 → 学習効率低下 |
| 🟡 警告 | リージョン0件のクラスが `regionClsList` に存在 | `classes.txt` と実データが不一致 |

問題ゼロ時: 「✓ 画像・クラス・ラベルに不一致はありません。学習に進めます。」
