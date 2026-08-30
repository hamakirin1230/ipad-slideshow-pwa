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

function extractInstallAction() {
  const start = guideSource.indexOf("function handleInstallAction()");
  const end = guideSource.indexOf("\n\n  if (actionMode", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return guideSource.slice(start, end);
}

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

  it("captures beforeinstallprompt in memory without persistent storage", () => {
    expect(homeSource).not.toContain("beforeinstallprompt");
    expect(guideSource).toContain(
      'window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)',
    );
    expect(guideSource).toContain("event.preventDefault()");
    expect(guideSource).toContain(
      "useRef<BeforeInstallPromptEvent | null>(null)",
    );
    expect(guideSource).not.toContain(
      "useState<BeforeInstallPromptEvent",
    );
    expect(browserHelperSource).not.toContain("beforeinstallprompt");
    expect(guideSource).not.toContain("localStorage");
    expect(guideSource).not.toContain("sessionStorage");
    expect(guideSource).not.toContain("indexedDB");
    expect(guideSource).not.toContain("document.cookie");
    expect(guideSource).not.toContain("fetch(");
  });

  it("uses user agent only for guide copy selection, not standalone detection", () => {
    expect(standaloneHelperSource).not.toContain("userAgent");
    expect(standaloneHelperSource).toContain(
      "return displayModeStandalone === true || navigatorStandalone === true;",
    );
    expect(standaloneHelperSource).not.toContain("detectPwaInstallGuide");
    expect(standaloneHelperSource).not.toContain("Android");
    expect(standaloneHelperSource).not.toContain("Chrome");
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

  it("starts and consumes the native prompt directly from the install click", () => {
    const action = extractInstallAction();
    const consumeAt = action.indexOf("promptEventRef.current = null");
    const guardAt = action.indexOf("promptInFlightRef.current = true");
    const promptAt = action.indexOf("promptEvent.prompt()");

    expect(action).not.toContain("await ");
    expect(action).not.toContain("setTimeout");
    expect(action).not.toContain("fetch(");
    expect(consumeAt).toBeGreaterThan(-1);
    expect(guardAt).toBeGreaterThan(consumeAt);
    expect(promptAt).toBeGreaterThan(guardAt);
    expect(action.match(/promptEvent\.prompt\(\)/g)).toHaveLength(1);
    expect(action.indexOf("setPromptPending(true)")).toBeGreaterThan(promptAt);
    expect(guideSource).toContain("if (promptInFlightRef.current) return");
  });

  it("keeps accepted pending on browser completion and falls back after dismissal", () => {
    expect(guideSource).toContain("promptEvent.userChoice");
    expect(guideSource).toContain('choice.outcome === "accepted"');
    expect(guideSource).toContain("acceptedInstallPendingRef.current");
    expect(guideSource).toContain(
      "acceptedInstallPendingRef.current ||",
    );
    expect(guideSource).toContain(
      "ブラウザの案内に従ってインストールを完了してください。",
    );
    expect(guideSource).toContain("applyManualFallback(");
    expect(guideSource).not.toContain("インストール済み");
    expect(guideSource).not.toContain("追加済み");
    expect(guideSource).not.toContain("retry");
  });

  it("hides install actions after appinstalled and keeps display-mode changes", () => {
    expect(guideSource).toContain(
      'window.addEventListener("appinstalled", handleAppInstalled)',
    );
    expect(guideSource).toContain("setStandalone(true)");
    expect(guideSource).toContain(
      'media.addEventListener("change", applyStandaloneSignals)',
    );
    expect(guideSource).toContain('if (actionMode === "hidden")');
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
    expect(guideSource).toContain(
      "aria-expanded={manualMode ? open : undefined}",
    );
    expect(guideSource).toContain(
      "aria-controls={manualMode ? panelId : undefined}",
    );
    expect(guideSource).toContain("アプリをインストール");
    expect(guideSource).toContain("min-h-12");
    expect(guideSource).toContain("閉じる");
    expect(guideSource).toContain('event.key === "Escape"');
    expect(guideSource).toContain("Share");
    expect(guideSource).not.toContain("Share2");
    expect(guideSource).not.toContain("追加済み");
  });
});
