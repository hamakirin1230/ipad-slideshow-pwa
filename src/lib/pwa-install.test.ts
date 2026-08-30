import { describe, expect, it } from "vitest";
import {
  isStandalonePwaDisplay,
  resolvePwaInstallActionMode,
} from "./pwa-install";

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

describe("PWA install action mode", () => {
  it("hides before client display resolution and in standalone mode", () => {
    expect(
      resolvePwaInstallActionMode({
        displayResolved: false,
        standalone: false,
        directPromptAvailable: true,
        promptPending: false,
      }),
    ).toBe("hidden");
    expect(
      resolvePwaInstallActionMode({
        displayResolved: true,
        standalone: true,
        directPromptAvailable: true,
        promptPending: false,
      }),
    ).toBe("hidden");
  });

  it("uses direct mode only when an actual prompt event is available", () => {
    expect(
      resolvePwaInstallActionMode({
        displayResolved: true,
        standalone: false,
        directPromptAvailable: true,
        promptPending: false,
      }),
    ).toBe("direct");
    expect(
      resolvePwaInstallActionMode({
        displayResolved: true,
        standalone: false,
        directPromptAvailable: false,
        promptPending: false,
      }),
    ).toBe("manual");
  });

  it("blocks a second action while the native prompt choice is pending", () => {
    expect(
      resolvePwaInstallActionMode({
        displayResolved: true,
        standalone: false,
        directPromptAvailable: true,
        promptPending: true,
      }),
    ).toBe("promptPending");
  });
});
