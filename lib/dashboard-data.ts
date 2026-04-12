/**
 * ダッシュボードデータ定義
 * 
 * 機能:
 * - ナビゲーション項目、ユーザー情報、モデル情報、ダータセット情報を定義
 * - 各キaージで共有できる統況データ（モデル一覧、ダタセット一覧など）
 * - 型定義（TypeScript）で首尾一貫したデータ構造を実現
 * 
 * 執体的な使用例:
 * - app/dashboard/page.tsx で使用
 * - components/* で使用
 */

// ナビゲーション項目の統伏を設定
const makePreview = (title: string, toneA: string, toneB: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${toneA}" />
          <stop offset="100%" stop-color="${toneB}" />
        </linearGradient>
      </defs>
      <rect width="640" height="480" rx="36" fill="url(#g)" />
      <circle cx="520" cy="100" r="70" fill="rgba(255,255,255,0.12)" />
      <circle cx="120" cy="380" r="110" fill="rgba(255,255,255,0.08)" />
      <text x="40" y="410" fill="white" font-family="Segoe UI, sans-serif" font-size="34" font-weight="700">${title}</text>
    </svg>
  `)}`;

// ナビゲーション項目の統一型定義
export type NavItem = {
  href: string;
  icon: string;
  label: string;
  description: string;
};

export type ModelStatus = "Training" | "Ready" | "Draft" | "Error";
export type JobStage = "Queued" | "Running" | "Review" | "Complete";
export type WorkflowStepStatus = "pending" | "running" | "completed";

export type Model = {
  id: number;
  name: string;
  baseModel: string;
  resolution: string;
  owner: string;
  dataset: string;
  version: string;
  status: ModelStatus;
  lastRun: string;
  tags: string[];
  learningRate: string;
  steps: number;
  promptBias: string;
};

export type Job = {
  id: number;
  modelName: string;
  stage: JobStage;
  progress: number;
  eta: string;
  gpu: string;
  priority: string;
};

export type Dataset = {
  id: number;
  name: string;
  images: number;
  split: string;
  quality: string;
  owner: string;
  captionPolicy: string;
};

export type WorkspaceSettings = {
  defaultBaseModel: string;
  defaultResolution: string;
  autoReview: boolean;
  maxConcurrentJobs: number;
  storagePolicy: string;
};

export type ImageRecord = {
  id: string;
  name: string;
  tags: string[];
  resolution: string;
  format: string;
  createdAt: string;
  dataset: string;
  prompt: string;
  preview: string;
};

export type ImageDatabase = {
  id: string;
  name: string;
  engine: string;
  status: "Connected" | "Read Only" | "Offline";
  region: string;
  imageCount: number;
  updatedAt: string;
  description: string;
  images: ImageRecord[];
};

export type WorkflowStep = {
  id: "model" | "folder" | "preprocess" | "annotation" | "training";
  title: string;
  summary: string;
  actionLabel: string;
  status: WorkflowStepStatus;
  detail: string;
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string;
};

export type WorkspacePipeline = {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  target: string;
  selectedModel: string;
  imageFolder: string;
  datasetFolder: string;
  databaseId: string;
  databaseType: string;
  steps: WorkflowStep[];
};

export const navItems: NavItem[] = [
  { href: "/dashboard", icon: "overview", label: "概要", description: "全体状況と主要指標" },
  {
    href: "/dashboard/workspaces",
    icon: "workspaces",
    label: "ワークスペース",
    description: "作成と実行フロー管理",
  },
  { href: "/dashboard/image-db", icon: "image-db", label: "リソースアクセス", description: "接続先と画像閲覧" },
  {
    href: "/dashboard/datasets",
    icon: "datasets",
    label: "データセット",
    description: "学習データと品質確認",
  },
  {
    href: "/dashboard/models",
    icon: "models",
    label: "カスタムモデル",
    description: "モデル一覧と状態確認",
  },
  { href: "/dashboard/jobs", icon: "jobs", label: "ジョブ", description: "キューと進捗の確認" },
  { href: "/dashboard/settings", icon: "settings", label: "設定", description: "全体設定" },
];

export const teamUsers: AppUser[] = [
  {
    id: "u-001",
    name: "佐藤 美咲",
    email: "misaki.sato@kenpin.ai",
    role: "Admin",
    team: "Vision Team",
  },
  {
    id: "u-002",
    name: "田中 翔",
    email: "sho.tanaka@kenpin.ai",
    role: "ML Engineer",
    team: "Vision Team",
  },
  {
    id: "u-003",
    name: "高橋 葵",
    email: "aoi.takahashi@kenpin.ai",
    role: "Data Ops",
    team: "Data Platform",
  },
  {
    id: "u-004",
    name: "山本 蓮",
    email: "ren.yamamoto@kenpin.ai",
    role: "QA Lead",
    team: "Factory QA",
  },
];

export const models: Model[] = [
  {
    id: 1,
    name: "PortraitSense v2",
    baseModel: "SDXL",
    resolution: "1024 x 1024",
    owner: "Creative Lab",
    dataset: "faces_master_12k",
    version: "v2.1",
    status: "Ready",
    lastRun: "2026-03-31 21:10",
    tags: ["portrait", "commercial", "hires"],
    learningRate: "1e-4",
    steps: 4200,
    promptBias: "soft cinematic portrait",
  },
  {
    id: 2,
    name: "Anime Key Art",
    baseModel: "Flux Dev",
    resolution: "1344 x 768",
    owner: "Marketing",
    dataset: "anime_pose_7k",
    version: "v0.9",
    status: "Training",
    lastRun: "2026-04-01 08:40",
    tags: ["anime", "poster", "stylized"],
    learningRate: "8e-5",
    steps: 6800,
    promptBias: "dramatic key visual, saturated light",
  },
  {
    id: 3,
    name: "Product Cutout Pro",
    baseModel: "YOLOv8n",
    resolution: "640 x 640",
    owner: "E-Commerce",
    dataset: "catalog_clean_3k",
    version: "v1.4",
    status: "Draft",
    lastRun: "2026-03-29 17:20",
    tags: ["product", "detection", "catalog"],
    learningRate: "5e-5",
    steps: 2500,
    promptBias: "clean studio lighting, packshot",
  },
];

export const jobs: Job[] = [
  {
    id: 101,
    modelName: "Anime Key Art",
    stage: "Running",
    progress: 64,
    eta: "18 min",
    gpu: "A100 x2",
    priority: "High",
  },
  {
    id: 102,
    modelName: "PortraitSense v2",
    stage: "Review",
    progress: 92,
    eta: "QA pending",
    gpu: "L40S x1",
    priority: "Normal",
  },
  {
    id: 103,
    modelName: "Product Cutout Pro",
    stage: "Queued",
    progress: 12,
    eta: "52 min",
    gpu: "RTX 6000 Ada",
    priority: "Normal",
  },
];

export const datasets: Dataset[] = [
  {
    id: 1,
    name: "faces_master_12k",
    images: 12048,
    split: "80 / 10 / 10",
    quality: "Curated",
    owner: "Creative Lab",
    captionPolicy: "Manual tags + aesthetic score",
  },
  {
    id: 2,
    name: "anime_pose_7k",
    images: 7014,
    split: "85 / 10 / 5",
    quality: "Mixed",
    owner: "Marketing",
    captionPolicy: "Auto caption + style keywords",
  },
  {
    id: 3,
    name: "catalog_clean_3k",
    images: 3120,
    split: "75 / 15 / 10",
    quality: "Clean",
    owner: "E-Commerce",
    captionPolicy: "SKU metadata + background label",
  },
];

export const workspaceSettings: WorkspaceSettings = {
  defaultBaseModel: "YOLOv8m",
  defaultResolution: "640 x 640",
  autoReview: true,
  maxConcurrentJobs: 4,
  storagePolicy: "Artifacts are retained for 30 days after approval.",
};

export const imageDatabases: ImageDatabase[] = [
  {
    id: "asset-hub-main",
    name: "Asset Hub Main",
    engine: "PostgreSQL + S3",
    status: "Connected",
    region: "ap-northeast-1",
    imageCount: 18420,
    updatedAt: "2026-04-03 10:20",
    description: "Main database for approved campaign and generated assets.",
    images: [
      {
        id: "img-001",
        name: "Tokyo Night Portrait",
        tags: ["portrait", "city", "approved"],
        resolution: "1024 x 1024",
        format: "PNG",
        createdAt: "2026-04-02 22:10",
        dataset: "faces_master_12k",
        prompt: "cinematic portrait, neon tokyo street, shallow depth of field",
        preview: makePreview("Tokyo Night Portrait", "#4b6bff", "#151b44"),
      },
      {
        id: "img-002",
        name: "Summer Campaign Hero",
        tags: ["fashion", "campaign", "hero"],
        resolution: "1344 x 768",
        format: "JPG",
        createdAt: "2026-04-03 09:15",
        dataset: "fashion_editorial_9k",
        prompt: "editorial summer look, clean sunlight, premium commercial style",
        preview: makePreview("Summer Campaign Hero", "#ffb36b", "#b94d3f"),
      },
      {
        id: "img-003",
        name: "Catalog White Background",
        tags: ["product", "packshot", "catalog"],
        resolution: "768 x 768",
        format: "WEBP",
        createdAt: "2026-04-01 18:40",
        dataset: "catalog_clean_3k",
        prompt: "studio packshot, white seamless background, high detail",
        preview: makePreview("Catalog White Background", "#9cc8ff", "#486899"),
      },
    ],
  },
  {
    id: "anime-reference-vault",
    name: "Anime Reference Vault",
    engine: "MySQL + Object Storage",
    status: "Read Only",
    region: "us-west-2",
    imageCount: 7630,
    updatedAt: "2026-04-02 19:55",
    description: "Reference-only store for anime key visuals and composition samples.",
    images: [
      {
        id: "img-101",
        name: "Skyline Duel Poster",
        tags: ["anime", "poster", "action"],
        resolution: "1344 x 768",
        format: "PNG",
        createdAt: "2026-03-30 21:50",
        dataset: "anime_pose_7k",
        prompt: "anime duel on rooftop, dramatic sky, poster composition",
        preview: makePreview("Skyline Duel Poster", "#7a6bff", "#28164a"),
      },
      {
        id: "img-102",
        name: "Festival Character Sheet",
        tags: ["anime", "character", "sheet"],
        resolution: "1024 x 1024",
        format: "PNG",
        createdAt: "2026-03-28 14:20",
        dataset: "anime_pose_7k",
        prompt: "anime character lineup, festival costume variations, clean layout",
        preview: makePreview("Festival Character Sheet", "#ff8ed2", "#8a2c69"),
      },
    ],
  },
  {
    id: "archive-cold-storage",
    name: "Archive Cold Storage",
    engine: "MongoDB GridFS",
    status: "Offline",
    region: "eu-central-1",
    imageCount: 52100,
    updatedAt: "2026-03-25 08:10",
    description: "Long-term archive storage. Currently unavailable due to maintenance.",
    images: [],
  },
];

export const availableAiModels = ["YOLOv8n", "YOLOv8m", "YOLOv8l", "YOLO11n", "YOLO11m"];

export const createDefaultWorkflowSteps = ({
  selectedModel,
  imageFolder,
  datasetFolder,
}: {
  selectedModel: string;
  imageFolder: string;
  datasetFolder: string;
}): WorkflowStep[] => [
  {
    id: "model",
    title: "モデル選択",
    summary: "利用する YOLO モデルを選択し、このワークスペースの基準モデルを確定します。",
    actionLabel: "モデルを確定",
    status: "pending",
    detail: `${selectedModel} を選択してください。`,
  },
  {
    id: "folder",
    title: "画像フォルダ接続",
    summary: "入力画像フォルダと学習データ出力先を確認して接続します。",
    actionLabel: "フォルダを接続",
    status: "pending",
    detail: `画像フォルダ: ${imageFolder} / 学習データ出力先: ${datasetFolder}`,
  },
  {
    id: "preprocess",
    title: "前処理",
    summary: "リサイズ、正規化、不要画像の除外など、学習前の前処理を実行します。",
    actionLabel: "前処理を実行",
    status: "pending",
    detail: "前の工程が終わると実行できます。",
  },
  {
    id: "annotation",
    title: "アノテーション",
    summary: "画像に対してラベル付けと品質確認を実行します。",
    actionLabel: "アノテーション実行",
    status: "pending",
    detail: "前の工程が終わると実行できます。",
  },
  {
    id: "training",
    title: "YOLO学習",
    summary: "最終データセットで YOLO 学習ジョブを開始します。",
    actionLabel: "学習を開始",
    status: "pending",
    detail: "前の工程が終わると実行できます。",
  },
];

export const workspacePipelines: WorkspacePipeline[] = [
  {
    id: "workspace-retail-01",
    name: "Retail Shelf Detector",
    ownerId: "u-002",
    ownerName: "田中 翔",
    ownerEmail: "sho.tanaka@kenpin.ai",
    target: "Store shelf object detection",
    selectedModel: "YOLOv8m",
    imageFolder: "D:\\images\\retail_shelf",
    datasetFolder: "D:\\datasets\\retail_shelf",
    databaseId: "asset-hub-main",
    databaseType: "cloud-mounted",
    steps: [
      {
        id: "model",
        title: "モデル選択",
        summary: "利用する YOLO モデルを選択し、このワークスペースの基準モデルを確定します。",
        actionLabel: "モデルを確定",
        status: "completed",
        detail: "YOLOv8m を選択済みです。",
      },
      {
        id: "folder",
        title: "画像フォルダ接続",
        summary: "入力画像フォルダと学習データ出力先を確認して接続します。",
        actionLabel: "フォルダを接続",
        status: "completed",
        detail: "画像フォルダと学習データ出力先の接続が完了しています。",
      },
      {
        id: "preprocess",
        title: "前処理",
        summary: "リサイズ、正規化、不要画像の除外など、学習前の前処理を実行します。",
        actionLabel: "前処理を実行",
        status: "running",
        detail: "画像の前処理を実行中です。",
      },
      {
        id: "annotation",
        title: "アノテーション",
        summary: "画像に対してラベル付けと品質確認を実行します。",
        actionLabel: "アノテーション実行",
        status: "pending",
        detail: "前の工程が終わると実行できます。",
      },
      {
        id: "training",
        title: "YOLO学習",
        summary: "最終データセットで YOLO 学習ジョブを開始します。",
        actionLabel: "学習を開始",
        status: "pending",
        detail: "前の工程が終わると実行できます。",
      },
    ],
  },
  {
    id: "workspace-parts-02",
    name: "Parts Inspection",
    ownerId: "u-004",
    ownerName: "山本 蓮",
    ownerEmail: "ren.yamamoto@kenpin.ai",
    target: "Industrial part defect detection",
    selectedModel: "YOLO11n",
    imageFolder: "E:\\vision\\parts_images",
    datasetFolder: "E:\\vision\\parts_inspection",
    databaseId: "asset-hub-main",
    databaseType: "cloud-mounted",
    steps: createDefaultWorkflowSteps({
      selectedModel: "YOLO11n",
      imageFolder: "E:\\vision\\parts_images",
      datasetFolder: "E:\\vision\\parts_inspection",
    }),
  },
];
