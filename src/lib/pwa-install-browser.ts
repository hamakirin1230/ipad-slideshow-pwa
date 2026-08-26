export type PwaInstallGuideBrowser = "safari" | "chrome" | "edge" | "other";

export type PwaInstallGuideCopy = {
  openedInLabel: string | null;
  step1: string;
  step2: string;
  step3: string;
  step4: string;
  footer: string | null;
};

const INSTALL_GUIDE_COPY: Record<PwaInstallGuideBrowser, PwaInstallGuideCopy> = {
  safari: {
    openedInLabel: "Safariで開いています",
    step1: "Safariの共有ボタンをタップ",
    step2: "「ホーム画面に追加」を選択",
    step3: "「Webアプリとして開く」が表示された場合はオンにする",
    step4: "「追加」をタップ",
    footer: null,
  },
  chrome: {
    openedInLabel: "Chromeで開いています",
    step1: "Chromeの共有ボタンをタップ",
    step2: "「ホーム画面に追加」を選択",
    step3: "画面の内容を確認する",
    step4: "「追加」をタップ",
    footer: null,
  },
  edge: {
    openedInLabel: "Edgeで開いています",
    step1: "Edgeの共有メニューを開く",
    step2: "「ホーム画面に追加」を選択",
    step3: "画面の内容を確認する",
    step4: "「追加」をタップ",
    footer: null,
  },
  other: {
    openedInLabel: null,
    step1: "ブラウザの共有メニューを開く",
    step2: "「ホーム画面に追加」を選択",
    step3: "「Webアプリとして開く」が表示された場合はオンにする",
    step4: "「追加」をタップ",
    footer: "Safari / Chrome / Edgeから追加できます。",
  },
};

export function detectPwaInstallGuideBrowser(
  userAgent: string,
): PwaInstallGuideBrowser {
  if (userAgent.includes("EdgiOS") || userAgent.includes("Edg/")) {
    return "edge";
  }

  if (userAgent.includes("CriOS") || userAgent.includes("Chrome/")) {
    return "chrome";
  }

  if (userAgent.includes("Safari/") && userAgent.includes("Version/")) {
    return "safari";
  }

  return "other";
}

export function getPwaInstallGuideCopy(
  browser: PwaInstallGuideBrowser,
): PwaInstallGuideCopy {
  return INSTALL_GUIDE_COPY[browser];
}
