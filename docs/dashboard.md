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
