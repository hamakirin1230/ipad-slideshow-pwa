import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeScreenInstallGuide } from "@/components/home-screen-install-guide";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const homeSource = read("./page.tsx");
const guideSource = read("../components/home-screen-install-guide.tsx");
const standaloneHelperSource = read("../lib/pwa-install.ts");
const browserHelperSource = read("../lib/pwa-install-browser.ts");

describe("home screen install guidance contract", () => {
  it("keeps the Home page as a Server Component that embeds the Client guide", () => {
    expect(homeSource).toContain("<HomeScreenInstallGuide />");
    expect(homeSource).toContain(
      'from "@/components/home-screen-install-guide"',
    );
    expect(homeSource.startsWith('"use client"')).toBe(false);
    expect(homeSource.startsWith("'use client'")).toBe(false);
    expect(guideSource.startsWith('"use client";')).toBe(true);
  });

  it("does not render install guidance before display-mode is known", () => {
    expect(renderToStaticMarkup(<HomeScreenInstallGuide />)).toBe("");
  });

  it("does not use beforeinstallprompt or persistent dismissal storage", () => {
    expect(homeSource).not.toContain("beforeinstallprompt");
    expect(guideSource).not.toContain("beforeinstallprompt");
    expect(standaloneHelperSource).not.toContain("beforeinstallprompt");
    expect(browserHelperSource).not.toContain("beforeinstallprompt");
    expect(guideSource).not.toContain("localStorage");
    expect(guideSource).not.toContain("sessionStorage");
  });

  it("uses user agent only for guide copy selection, not standalone detection", () => {
    expect(standaloneHelperSource).not.toContain("userAgent");
    expect(standaloneHelperSource).toContain(
      "return displayModeStandalone === true || navigatorStandalone === true;",
    );
    expect(standaloneHelperSource).not.toContain("detectPwaInstallGuide");
    expect(standaloneHelperSource).not.toContain("Android");
    expect(browserHelperSource).toContain("detectPwaInstallGuideTarget");
    expect(browserHelperSource).toContain("detectPwaInstallGuideBrowser");
    expect(browserHelperSource).toContain("getPwaInstallGuideCopy");
    expect(browserHelperSource).toContain("userAgent");
    expect(guideSource).toContain(
      "isStandalonePwaDisplay(readBrowserStandaloneSignals())",
    );
    expect(guideSource).toContain(
      "detectPwaInstallGuideTarget(navigator.userAgent)",
    );
    expect(guideSource).toContain("getPwaInstallGuideCopy(guideTarget)");
    expect(guideSource).not.toContain("getPwaInstallGuideCopy(guideBrowser)");
  });

  it("uses shared install copy without claiming install completion", () => {
    expect(guideSource).toContain("ホーム画面に追加");
    expect(browserHelperSource).toContain("Safariの共有ボタンをタップ");
    expect(browserHelperSource).toContain("Chromeの共有ボタンをタップ");
    expect(browserHelperSource).toContain("Edgeの共有メニューを開く");
    expect(browserHelperSource).toContain("ブラウザの共有メニューを開く");
    expect(browserHelperSource).toContain("「ホーム画面に追加」を選択");
    expect(browserHelperSource).toContain(
      "「Webアプリとして開く」が表示された場合はオンにする",
    );
    expect(browserHelperSource).toContain("画面の内容を確認する");
    expect(browserHelperSource).toContain("「追加」をタップ");
    expect(browserHelperSource).toContain("Chrome右上の「︙」メニューを開く");
    expect(guideSource).toContain("aria-expanded={open}");
    expect(guideSource).toContain("aria-controls={panelId}");
    expect(guideSource).toContain("閉じる");
    expect(guideSource).toContain("Share");
    expect(guideSource).not.toContain("Share2");
    expect(guideSource).not.toContain("追加済み");
  });
});
