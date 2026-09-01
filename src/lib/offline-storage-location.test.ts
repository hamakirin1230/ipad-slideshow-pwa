import { describe, expect, it } from "vitest";
import { getOfflineStorageLocationView } from "./offline-storage-location";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8)";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

describe("getOfflineStorageLocationView", () => {
  it.each([
    [IPHONE, 5, "このiPhone/iPadのアプリ用ストレージ", "ファイル"],
    [IPAD, 5, "このiPhone/iPadのアプリ用ストレージ", "ファイル"],
    [MAC, 5, "このiPhone/iPadのアプリ用ストレージ", "ファイル"],
    [
      ANDROID,
      5,
      "このAndroid端末のアプリ用ストレージ",
      "ダウンロードフォルダには保存されません",
    ],
    [MAC, 0, "このMacのブラウザ用ストレージ", "Finder"],
    [WINDOWS, 0, "このPCのブラウザ用ストレージ", "エクスプローラー"],
    [
      "Mozilla/5.0 (X11; Linux x86_64)",
      0,
      "この端末のブラウザ用ストレージ",
      "ブラウザのアプリデータ",
    ],
  ])(
    "returns platform-safe wording",
    (userAgent, maxTouchPoints, label, description) => {
      const view = getOfflineStorageLocationView({
        userAgent,
        maxTouchPoints,
      });

      expect(view.label).toBe(label);
      expect(view.description).toContain(description);
    },
  );

  it("never returns a physical browser storage path", () => {
    const views = [IPHONE, IPAD, ANDROID, MAC, WINDOWS, "unknown"].map(
      (userAgent) =>
        getOfflineStorageLocationView({ userAgent, maxTouchPoints: 0 }),
    );

    expect(JSON.stringify(views)).not.toMatch(
      /~\/Library|AppData|IndexedDB path|Chrome profile|Safari internal|\/Users\//i,
    );
  });

  it("returns stable snapshots for useSyncExternalStore", () => {
    const input = { userAgent: MAC, maxTouchPoints: 0 };

    expect(getOfflineStorageLocationView(input)).toBe(getOfflineStorageLocationView(input));
  });
});
