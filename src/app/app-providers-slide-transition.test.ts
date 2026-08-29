import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./app-providers.tsx", import.meta.url), "utf8");
const updateSource = source.slice(
  source.indexOf("async function updateSelectedProjectTransitionSettings("),
  source.indexOf("async function updateProjectSlideCaption("),
);

describe("AppProviders album slide transition wiring", () => {
  it("reads transition settings from the selected Drive manifest details", () => {
    expect(source).toContain("projectTransition: projectDetails?.transition");
    expect(source).toContain(
      "projectTransitionStrength: projectDetails?.transitionStrength",
    );
    expect(source).toContain("updateSelectedProjectTransitionSettings");
    expect(source).toContain("updateDriveProjectTransition");
    expect(updateSource).toContain("transition: transitionInput");
    expect(updateSource).toContain("transitionStrength: strengthInput");
  });

  it("reconfirms project state after a Drive transition save and does not auto-sync local", () => {
    expect(updateSource).toContain("applyProjectReadyState(result.project, toProjectDetails(result.details))");
    expect(updateSource).toContain("setWorkspaceReadyContext");
    expect(updateSource).not.toContain("startOfflineSync");
    expect(updateSource).not.toContain("createDriveOfflineStagingSyncRuntime");
    expect(updateSource).not.toContain("retry");
    expect(updateSource).not.toContain("commitPreparedProjectPublish");
    expect(updateSource).toContain("areProjectSlideTransitionSettingsEqual");
  });
});
