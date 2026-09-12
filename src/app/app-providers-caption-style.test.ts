import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./app-providers.tsx", import.meta.url), "utf8");
const update = source.slice(source.indexOf("  async function updateSelectedProjectCaptionStyle("), source.indexOf("  async function updateProjectSlideEdits("));

describe("AppProviders captionStyle update authority", () => {
  it("exposes verified selected project style and copies it from ready details", () => {
    expect(source).toContain("projectCaptionStyle: projectDetails?.captionStyle");
    expect(source).toContain("...pickProjectSlideCaptionStyle(details)");
    expect(update).toContain("applyProjectReadyState(result.project, toProjectDetails(result.details))");
    expect(update).toContain("indexJsonText: result.indexJsonText");
  });
  it("checks in-flight, validation, readiness and effective no-op before invoking Drive", () => {
    const beforeWrite = update.slice(0, update.indexOf("await updateDriveProjectCaptionStyle"));
    for (const guard of ["driveOperationInFlightRef.current", "parseProjectSlideCaptionStyle(captionStyle)", '!accessToken', 'driveStatus !== "ready"', 'projectStatus !== "ready"', "!readyWorkspace", "!readyProject", "areProjectSlideCaptionStylesEqual(projectDetails?.captionStyle, captionStyle)"]) {
      expect(beforeWrite).toContain(guard);
    }
    expect(update).toContain("runDriveOperationStep(requestId, operation)");
    expect(update).toContain("requestId !== driveOperationRequestIdRef.current");
  });
  it("uses sanitized error handling and releases operation state without auto-save or retry", () => {
    expect(update).toContain("error instanceof DriveProjectCaptionStyleUpdateError");
    expect(update).toContain("setProjectDiagnostics(error.diagnostics)");
    expect(update).toContain("resetGoogleAfterDriveAuthFailure()");
    expect(update).toContain("setDriveOperationInFlight(false)");
    expect(update).not.toMatch(/startOfflineSync|retry|console\.|error\.message|commitPreparedProjectPublish/);
  });
});
