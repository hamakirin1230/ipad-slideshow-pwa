import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(
  new URL("./settings/page.tsx", import.meta.url),
  "utf8",
);
const driveSettingsSource = readFileSync(
  new URL("./settings/drive-settings-panel.tsx", import.meta.url),
  "utf8",
);

describe("production task copy", () => {
  it("keeps the three primary task routes on Home without a development roadmap", () => {
    for (const href of ["/player", "/admin", "/settings"]) {
      expect(homeSource).toContain(`href: "${href}"`);
    }

    expect(homeSource).not.toContain("次の開発候補");
    expect(homeSource).not.toContain("nextStepItems");
    expect(homeSource).not.toContain("現在の到達点");
  });

  it("keeps Settings focused on connection checks instead of implementation status", () => {
    expect(settingsSource).toContain("<DriveSettingsPanel />");
    expect(settingsSource).toContain("<OfflineDbCheckPanel />");
    expect(settingsSource).not.toContain("futureItems");
    expect(settingsSource).not.toContain("notImplementedItems");
    expect(settingsSource).not.toContain("まだ未実装");
    expect(settingsSource).not.toContain("次の候補");
  });

  it("describes a ready Drive workspace without claiming offline sync happened", () => {
    expect(driveSettingsSource).not.toContain("オフライン再生未対応");
    expect(driveSettingsSource).toContain(
      "保存や公開だけでは、この端末の再生用データは更新されません。",
    );
    expect(driveSettingsSource).toContain(
      "remoteOnly動画は動画本体を端末に保存せず",
    );
  });

  it("preserves the existing Google and Drive button guards", () => {
    for (const guard of [
      "disabled={!canConnect}",
      "disabled={!canCheckDrive}",
      "disabled={!canResetGoogleAuth}",
      "disabled={isDriveCreating}",
      "disabled={!canDisconnect}",
    ]) {
      expect(driveSettingsSource).toContain(guard);
    }
  });
});
