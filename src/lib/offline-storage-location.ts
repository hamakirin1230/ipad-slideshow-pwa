import { detectPwaInstallGuidePlatform } from "@/lib/pwa-install-browser";

export type OfflineStorageLocationInput = {
  userAgent: string;
  maxTouchPoints: number;
};

export type OfflineStorageLocationView = {
  label: string;
  description: string;
};

export type OfflineStorageLocationPlatform =
  | "ios"
  | "android"
  | "macos"
  | "windows"
  | "unknown";

const IOS_STORAGE_LOCATION: OfflineStorageLocationView = {
  label: "このiPhone/iPadのアプリ用ストレージ",
  description:
    "「ファイル」アプリ内の保存先ではありません。この端末でオフライン再生するためのデータとして保存します。",
};

const ANDROID_STORAGE_LOCATION: OfflineStorageLocationView = {
  label: "このAndroid端末のアプリ用ストレージ",
  description:
    "ダウンロードフォルダには保存されません。ブラウザ/PWAのアプリデータとして保存します。",
};

const WINDOWS_STORAGE_LOCATION: OfflineStorageLocationView = {
  label: "このPCのブラウザ用ストレージ",
  description:
    "エクスプローラーやダウンロードフォルダにファイルとして保存されるものではありません。",
};

const MACOS_STORAGE_LOCATION: OfflineStorageLocationView = {
  label: "このMacのブラウザ用ストレージ",
  description:
    "Finderやダウンロードフォルダにファイルとして保存されるものではありません。",
};

const UNKNOWN_STORAGE_LOCATION: OfflineStorageLocationView = {
  label: "この端末のブラウザ用ストレージ",
  description: "ブラウザのアプリデータとして保存します。",
};

const CLIENT_STORAGE_LOCATION_PLATFORM: OfflineStorageLocationPlatform =
  typeof navigator === "undefined"
    ? "unknown"
    : getOfflineStorageLocationPlatform({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints ?? 0,
      });
const NOOP_UNSUBSCRIBE = () => {};

export function getOfflineStorageLocationView(
  input: OfflineStorageLocationInput,
): OfflineStorageLocationView {
  return getOfflineStorageLocationViewForPlatform(
    getOfflineStorageLocationPlatform(input),
  );
}

export function getOfflineStorageLocationPlatform(
  input: OfflineStorageLocationInput,
): OfflineStorageLocationPlatform {
  const platform = detectPwaInstallGuidePlatform(input.userAgent);
  const isIPadOsDesktopUa =
    input.userAgent.includes("Macintosh") && input.maxTouchPoints > 1;

  if (platform === "ios" || isIPadOsDesktopUa) {
    return "ios";
  }

  if (platform === "android") {
    return "android";
  }

  if (
    input.userAgent.includes("Windows") &&
    !input.userAgent.includes("Windows Phone")
  ) {
    return "windows";
  }

  if (
    input.userAgent.includes("Macintosh") ||
    input.userAgent.includes("Mac OS X")
  ) {
    return "macos";
  }

  return "unknown";
}

export function getOfflineStorageLocationViewForPlatform(
  platform: OfflineStorageLocationPlatform,
): OfflineStorageLocationView {
  switch (platform) {
    case "ios":
      return IOS_STORAGE_LOCATION;
    case "android":
      return ANDROID_STORAGE_LOCATION;
    case "macos":
      return MACOS_STORAGE_LOCATION;
    case "windows":
      return WINDOWS_STORAGE_LOCATION;
    case "unknown":
      return UNKNOWN_STORAGE_LOCATION;
  }
}

export function subscribeOfflineStorageLocation(): () => void {
  return NOOP_UNSUBSCRIBE;
}

export function readOfflineStorageLocationClient(): OfflineStorageLocationPlatform {
  return CLIENT_STORAGE_LOCATION_PLATFORM;
}

export function getOfflineStorageLocationServer(): OfflineStorageLocationPlatform {
  return "unknown";
}
