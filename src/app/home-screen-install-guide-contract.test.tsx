import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeScreenInstallGuide } from "@/components/home-screen-install-guide";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const homeSource = read("./page.tsx");
const guideSource = read("../components/home-screen-install-guide.tsx");
const helperSource = read("../lib/pwa-install.ts");

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

  it("does not use beforeinstallprompt or user-agent branching", () => {
    expect(homeSource).not.toContain("beforeinstallprompt");
    expect(guideSource).not.toContain("beforeinstallprompt");
    expect(helperSource).not.toContain("beforeinstallprompt");
    expect(guideSource).not.toContain("userAgent");
    expect(helperSource).not.toContain("userAgent");
    expect(guideSource).not.toContain("localStorage");
    expect(guideSource).not.toContain("sessionStorage");
  });

  it("uses shared iPad install copy without claiming install completion", () => {
    expect(guideSource).toContain("ホーム画面に追加");
    expect(guideSource).toContain("iPadにアプリとして追加");
    expect(guideSource).toContain("ブラウザの「共有」をタップ");
    expect(guideSource).toContain("「ホーム画面に追加」を選択");
    expect(guideSource).toContain(
      "「Webアプリとして開く」が表示された場合はオンにする",
    );
    expect(guideSource).toContain("「追加」をタップ");
    expect(guideSource).toContain("Safari / Chrome / Edgeから追加できます。");
    expect(guideSource).toContain("aria-expanded={open}");
    expect(guideSource).toContain("aria-controls={panelId}");
    expect(guideSource).toContain("閉じる");
    expect(guideSource).not.toContain("追加済み");
  });
});
