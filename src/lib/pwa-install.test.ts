import { describe, expect, it } from "vitest";
import { isStandalonePwaDisplay } from "./pwa-install";

describe("PWA standalone display detection", () => {
  it("treats display-mode standalone as installed", () => {
    expect(
      isStandalonePwaDisplay({
        displayModeStandalone: true,
        navigatorStandalone: false,
      }),
    ).toBe(true);
  });

  it("treats navigator standalone as installed", () => {
    expect(
      isStandalonePwaDisplay({
        displayModeStandalone: false,
        navigatorStandalone: true,
      }),
    ).toBe(true);
  });

  it("treats both signals false as browser mode", () => {
    expect(
      isStandalonePwaDisplay({
        displayModeStandalone: false,
        navigatorStandalone: false,
      }),
    ).toBe(false);
  });

  it("treats a missing navigator standalone property as browser mode", () => {
    expect(
      isStandalonePwaDisplay({
        displayModeStandalone: false,
      }),
    ).toBe(false);
  });

  it("treats either signal alone as installed", () => {
    expect(
      isStandalonePwaDisplay({
        displayModeStandalone: true,
      }),
    ).toBe(true);
    expect(
      isStandalonePwaDisplay({
        displayModeStandalone: false,
        navigatorStandalone: true,
      }),
    ).toBe(true);
  });
});
