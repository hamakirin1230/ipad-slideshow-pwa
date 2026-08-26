import { describe, expect, it } from "vitest";
import {
  detectPwaInstallGuideTarget,
  getPwaInstallGuideCopy,
} from "./pwa-install-browser";

const IPAD_SAFARI =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_CHROME =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1";
const IPAD_EDGE =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/120.0.0.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Safari/537.36";
const ANDROID_EDGE =
  "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 EdgA/120.0.0.0";
const DESKTOP_EDGE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

describe("PWA install guide target detection", () => {
  it("detects iPad Safari, Chrome, and Edge without changing standalone authority", () => {
    expect(detectPwaInstallGuideTarget(IPAD_SAFARI)).toEqual({
      platform: "ios",
      browser: "safari",
    });
    expect(detectPwaInstallGuideTarget(IPAD_CHROME)).toEqual({
      platform: "ios",
      browser: "chrome",
    });
    expect(detectPwaInstallGuideTarget(IPAD_EDGE)).toEqual({
      platform: "ios",
      browser: "edge",
    });
  });

  it("detects Android Chrome and does not treat Edge as Chrome", () => {
    expect(detectPwaInstallGuideTarget(ANDROID_CHROME)).toEqual({
      platform: "android",
      browser: "chrome",
    });
    expect(detectPwaInstallGuideTarget(ANDROID_EDGE)).toEqual({
      platform: "android",
      browser: "edge",
    });
    expect(detectPwaInstallGuideTarget(DESKTOP_EDGE)).toEqual({
      platform: "other",
      browser: "edge",
    });
    expect(detectPwaInstallGuideTarget(DESKTOP_CHROME)).toEqual({
      platform: "other",
      browser: "chrome",
    });
  });

  it("uses other for an unknown UA", () => {
    expect(detectPwaInstallGuideTarget("unknown-client")).toEqual({
      platform: "other",
      browser: "other",
    });
  });

  it("does not treat iPad Chrome as Safari", () => {
    expect(detectPwaInstallGuideTarget(IPAD_CHROME).browser).toBe("chrome");
  });
});

describe("PWA install guide copy selection", () => {
  it("keeps iPad Safari, Chrome, and Edge share steps", () => {
    const safari = getPwaInstallGuideCopy(detectPwaInstallGuideTarget(IPAD_SAFARI));
    const chrome = getPwaInstallGuideCopy(detectPwaInstallGuideTarget(IPAD_CHROME));
    const edge = getPwaInstallGuideCopy(detectPwaInstallGuideTarget(IPAD_EDGE));

    expect(safari.steps[0]).toBe("Safariの共有ボタンをタップ");
    expect(chrome.steps[0]).toBe("Chromeの共有ボタンをタップ");
    expect(edge.steps[0]).toBe("Edgeの共有メニューを開く");
    expect(safari.steps).toContain(
      "「Webアプリとして開く」が表示された場合はオンにする",
    );
    expect(safari.showShareIconOnFirstStep).toBe(true);
    expect(chrome.showShareIconOnFirstStep).toBe(true);
    expect(edge.showShareIconOnFirstStep).toBe(true);
  });

  it("uses Android Chrome menu steps instead of iPad share steps", () => {
    const copy = getPwaInstallGuideCopy(
      detectPwaInstallGuideTarget(ANDROID_CHROME),
    );
    expect(copy.heading).toBe("ホーム画面に追加");
    expect(copy.openedInLabel).toBe("Chromeで開いています");
    expect(copy.steps).toEqual([
      "Chrome右上の「︙」メニューを開く",
      "「ホーム画面に追加」またはブラウザが提示する追加項目を選ぶ",
      "画面の案内に従って追加する",
    ]);
    expect(copy.steps.join(" ")).not.toContain("共有ボタン");
    expect(copy.steps.join(" ")).not.toContain("共有メニュー");
    expect(copy.showShareIconOnFirstStep).toBe(false);
  });

  it("does not return iPad share steps for Android Edge", () => {
    const copy = getPwaInstallGuideCopy(detectPwaInstallGuideTarget(ANDROID_EDGE));
    expect(copy.steps.join(" ")).not.toContain("共有ボタン");
    expect(copy.steps.join(" ")).not.toContain("共有メニュー");
    expect(copy.showShareIconOnFirstStep).toBe(false);
  });

  it("keeps a generic fallback that is not iPad-share-only", () => {
    const unknown = getPwaInstallGuideCopy({ platform: "other", browser: "other" });
    const desktopChrome = getPwaInstallGuideCopy(
      detectPwaInstallGuideTarget(DESKTOP_CHROME),
    );
    expect(unknown.steps[0]).not.toContain("Safariの共有");
    expect(unknown.showShareIconOnFirstStep).toBe(false);
    expect(desktopChrome.showShareIconOnFirstStep).toBe(false);
    expect(desktopChrome.steps.join(" ")).not.toContain("Safariの共有ボタン");
  });
});
