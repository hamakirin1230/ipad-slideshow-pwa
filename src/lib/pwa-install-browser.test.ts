import { describe, expect, it } from "vitest";
import {
  detectPwaInstallGuideBrowser,
  getPwaInstallGuideCopy,
} from "./pwa-install-browser";

describe("PWA install guide browser detection", () => {
  it("detects Edge from EdgiOS", () => {
    expect(
      detectPwaInstallGuideBrowser(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/120.0.0.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("edge");
  });

  it("detects Chrome from CriOS", () => {
    expect(
      detectPwaInstallGuideBrowser(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("chrome");
  });

  it("detects Safari from a Safari-identifiable UA", () => {
    expect(
      detectPwaInstallGuideBrowser(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("safari");
  });

  it("uses other for an unknown UA", () => {
    expect(detectPwaInstallGuideBrowser("unknown-client")).toBe("other");
  });

  it("does not treat Edge as Chrome", () => {
    expect(
      detectPwaInstallGuideBrowser(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
      ),
    ).toBe("edge");
  });

  it("does not treat Chrome as Safari", () => {
    expect(
      detectPwaInstallGuideBrowser(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("chrome");
  });
});

describe("PWA install guide copy selection", () => {
  it("keeps Safari, Chrome, Edge, and fallback step copy distinct", () => {
    expect(getPwaInstallGuideCopy("safari").step1).toBe(
      "Safariの共有ボタンをタップ",
    );
    expect(getPwaInstallGuideCopy("chrome").step1).toBe(
      "Chromeの共有ボタンをタップ",
    );
    expect(getPwaInstallGuideCopy("edge").step1).toBe(
      "Edgeの共有メニューを開く",
    );
    expect(getPwaInstallGuideCopy("other").step1).toBe(
      "ブラウザの共有メニューを開く",
    );
    expect(getPwaInstallGuideCopy("chrome").step3).toBe(
      "画面の内容を確認する",
    );
    expect(getPwaInstallGuideCopy("safari").step3).toBe(
      "「Webアプリとして開く」が表示された場合はオンにする",
    );
  });
});
