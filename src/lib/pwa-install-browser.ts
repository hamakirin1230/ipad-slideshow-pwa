export type PwaInstallGuidePlatform = "ios" | "android" | "other";
export type PwaInstallGuideBrowser = "safari" | "chrome" | "edge" | "other";

export type PwaInstallGuideTarget = {
  platform: PwaInstallGuidePlatform;
  browser: PwaInstallGuideBrowser;
};

export type PwaInstallGuideCopy = {
  heading: string;
  openedInLabel: string | null;
  steps: string[];
  showShareIconOnFirstStep: boolean;
  footer: string | null;
};

const HEADING = "ホーム画面に追加";

const IOS_COPY: Record<PwaInstallGuideBrowser, PwaInstallGuideCopy> = {
  safari: {
    heading: HEADING,
    openedInLabel: "Safariで開いています",
    steps: [
      "Safariの共有ボタンをタップ",
      "「ホーム画面に追加」を選択",
      "「Webアプリとして開く」が表示された場合はオンにする",
      "「追加」をタップ",
    ],
    showShareIconOnFirstStep: true,
    footer: null,
  },
  chrome: {
    heading: HEADING,
    openedInLabel: "Chromeで開いています",
    steps: [
      "Chromeの共有ボタンをタップ",
      "「ホーム画面に追加」を選択",
      "画面の内容を確認する",
      "「追加」をタップ",
    ],
    showShareIconOnFirstStep: true,
    footer: null,
  },
  edge: {
    heading: HEADING,
    openedInLabel: "Edgeで開いています",
    steps: [
      "Edgeの共有メニューを開く",
      "「ホーム画面に追加」を選択",
      "画面の内容を確認する",
      "「追加」をタップ",
    ],
    showShareIconOnFirstStep: true,
    footer: null,
  },
  other: {
    heading: HEADING,
    openedInLabel: null,
    steps: [
      "ブラウザの共有メニューを開く",
      "「ホーム画面に追加」を選択",
      "「Webアプリとして開く」が表示された場合はオンにする",
      "「追加」をタップ",
    ],
    showShareIconOnFirstStep: true,
    footer: "Safari / Chrome / Edgeから追加できます。",
  },
};

const ANDROID_CHROME_COPY: PwaInstallGuideCopy = {
  heading: HEADING,
  openedInLabel: "Chromeで開いています",
  steps: [
    "Chrome右上の「︙」メニューを開く",
    "「ホーム画面に追加」またはブラウザが提示する追加項目を選ぶ",
    "画面の案内に従って追加する",
  ],
  showShareIconOnFirstStep: false,
  footer: null,
};

const ANDROID_GENERIC_COPY: PwaInstallGuideCopy = {
  heading: HEADING,
  openedInLabel: null,
  steps: [
    "ブラウザのメニューを開く",
    "「ホーム画面に追加」またはブラウザが提示する追加項目を選ぶ",
    "画面の案内に従って追加する",
  ],
  showShareIconOnFirstStep: false,
  footer: null,
};

const GENERIC_COPY: PwaInstallGuideCopy = {
  heading: HEADING,
  openedInLabel: null,
  steps: [
    "ブラウザのメニューまたは共有から「ホーム画面に追加」を探す",
    "「ホーム画面に追加」またはブラウザが提示する追加項目を選ぶ",
    "画面の案内に従って追加する",
  ],
  showShareIconOnFirstStep: false,
  footer: "ブラウザのメニューからホーム画面に追加できます。",
};

export function detectPwaInstallGuidePlatform(
  userAgent: string,
): PwaInstallGuidePlatform {
  if (userAgent.includes("Android")) {
    return "android";
  }

  if (
    userAgent.includes("iPhone") ||
    userAgent.includes("iPad") ||
    userAgent.includes("iPod") ||
    userAgent.includes("CriOS") ||
    userAgent.includes("EdgiOS")
  ) {
    return "ios";
  }

  return "other";
}

export function detectPwaInstallGuideBrowser(
  userAgent: string,
): PwaInstallGuideBrowser {
  if (
    userAgent.includes("EdgiOS") ||
    userAgent.includes("EdgA") ||
    userAgent.includes("Edg/")
  ) {
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

export function detectPwaInstallGuideTarget(
  userAgent: string,
): PwaInstallGuideTarget {
  return {
    platform: detectPwaInstallGuidePlatform(userAgent),
    browser: detectPwaInstallGuideBrowser(userAgent),
  };
}

export function getPwaInstallGuideCopy(
  target: PwaInstallGuideTarget,
): PwaInstallGuideCopy {
  if (target.platform === "ios") {
    return IOS_COPY[target.browser];
  }

  if (target.platform === "android" && target.browser === "chrome") {
    return ANDROID_CHROME_COPY;
  }

  if (target.platform === "android") {
    return ANDROID_GENERIC_COPY;
  }

  return GENERIC_COPY;
}
