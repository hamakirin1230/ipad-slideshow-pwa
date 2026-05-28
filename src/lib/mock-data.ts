export type ProjectStatus = "draft" | "published";

export type AssetKind = "image" | "video" | "title-card";

export type SlideFit = "contain" | "cover";

export type CaptionPreset = "none" | "bottom" | "center";

export type Asset = {
  id: string;
  kind: AssetKind;
  title: string;
  filename: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  sizeLabel: string;
  isSelectedForSlideshow: boolean;
  createdAt: string;
  note?: string;
};

export type SlideItem = {
  id: string;
  assetId: string;
  order: number;
  durationSeconds: number;
  fit: SlideFit;
  captionPreset: CaptionPreset;
  caption?: string;
};

export type Project = {
  id: string;
  title: string;
  description: string;
  status: ProjectStatus;
  workspaceName: string;
  updatedAt: string;
  publishedAt?: string;
  slideItems: SlideItem[];
};

export const mockAssets: Asset[] = [
  {
    id: "asset-title-001",
    kind: "title-card",
    title: "オープニングタイトル",
    filename: "title-opening",
    sizeLabel: "仮タイトルカード",
    isSelectedForSlideshow: true,
    createdAt: "2026-05-27",
    note: "第2ゴール用の仮タイトル素材です。",
  },
  {
    id: "asset-image-001",
    kind: "image",
    title: "集合写真",
    filename: "graduation-group-photo.jpg",
    width: 2048,
    height: 1365,
    sizeLabel: "約1.2 MB",
    isSelectedForSlideshow: true,
    createdAt: "2026-05-27",
  },
  {
    id: "asset-image-002",
    kind: "image",
    title: "教室での様子",
    filename: "classroom-scene.jpg",
    width: 2048,
    height: 1536,
    sizeLabel: "約1.0 MB",
    isSelectedForSlideshow: true,
    createdAt: "2026-05-27",
  },
  {
    id: "asset-video-001",
    kind: "video",
    title: "メッセージ動画",
    filename: "message-short.mp4",
    width: 1920,
    height: 1080,
    durationSeconds: 18,
    sizeLabel: "約24 MB",
    isSelectedForSlideshow: false,
    createdAt: "2026-05-27",
    note: "動画は後続ゴールで本格対応します。第2では一覧表示のみです。",
  },
];

export const mockProjects: Project[] = [
  {
    id: "project-graduation-2026",
    title: "卒業式スライドショー 2026",
    description: "卒業式当日にiPadで再生する想定のサンプルプロジェクトです。",
    status: "draft",
    workspaceName: "Slideshow Projects",
    updatedAt: "2026-05-27",
    slideItems: [
      {
        id: "slide-001",
        assetId: "asset-title-001",
        order: 1,
        durationSeconds: 5,
        fit: "contain",
        captionPreset: "center",
        caption: "卒業おめでとう",
      },
      {
        id: "slide-002",
        assetId: "asset-image-001",
        order: 2,
        durationSeconds: 7,
        fit: "contain",
        captionPreset: "bottom",
        caption: "みんなで過ごした日々",
      },
      {
        id: "slide-003",
        assetId: "asset-image-002",
        order: 3,
        durationSeconds: 7,
        fit: "cover",
        captionPreset: "bottom",
        caption: "教室での思い出",
      },
    ],
  },
  {
    id: "project-festival-opening",
    title: "文化祭オープニング",
    description: "文化祭の開会前に流す想定のサンプルプロジェクトです。",
    status: "published",
    workspaceName: "Slideshow Projects",
    updatedAt: "2026-05-26",
    publishedAt: "2026-05-26",
    slideItems: [
      {
        id: "slide-101",
        assetId: "asset-title-001",
        order: 1,
        durationSeconds: 4,
        fit: "contain",
        captionPreset: "center",
        caption: "文化祭スタート",
      },
    ],
  },
];

export const mockActiveProject = mockProjects[0];

export function getAssetById(assetId: string) {
  return mockAssets.find((asset) => asset.id === assetId);
}

export function getProjectAssets(project: Project) {
  return project.slideItems
    .map((slideItem) => getAssetById(slideItem.assetId))
    .filter((asset): asset is Asset => Boolean(asset));
}