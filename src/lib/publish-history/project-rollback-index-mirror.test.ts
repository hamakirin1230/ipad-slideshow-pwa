import { describe, expect, it } from "vitest";
import type { DriveProjectSummary } from "../google-drive";
import { buildDesiredIndexBody } from "./project-rollback-index-mirror";

const current: DriveProjectSummary = {
  projectId: "22222222-2222-4222-8222-222222222222",
  title: "Current",
  projectFolderId: "project-folder",
  manifestFileId: "manifest-file",
  assetsFolderId: "assets-folder",
  manifestPath: "manifest.json",
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-28T01:00:00.000Z",
};
const other: DriveProjectSummary = {
  ...current,
  projectId: "33333333-3333-4333-8333-333333333333",
  title: "Other",
  projectFolderId: "other-project",
  manifestFileId: "other-manifest",
  assetsFolderId: "other-assets",
};

describe("rollback index mirror body", () => {
  it("changes only selected project title and updatedAt", () => {
    const source = {
      app: "ipad-slideshow-pwa",
      role: "index",
      schemaVersion: 1,
      workspaceId: "11111111-1111-4111-8111-111111111111",
      projects: [{ ...current, extra: "keep" }, other],
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-28T01:00:00.000Z",
      futureField: { keep: true },
    };
    const desired = buildDesiredIndexBody(source, current, {
      ...current,
      title: "Restored",
      updatedAt: "2026-07-28T02:00:00.000Z",
    });
    expect(desired).toEqual({
      ...source,
      projects: [
        {
          ...current,
          extra: "keep",
          title: "Restored",
          updatedAt: "2026-07-28T02:00:00.000Z",
        },
        other,
      ],
    });
    expect(source.projects[0]).toMatchObject({
      title: "Current",
      extra: "keep",
    });
  });

  it("refuses a stale or duplicate target record", () => {
    expect(
      buildDesiredIndexBody(
        { projects: [{ ...current, title: "Changed" }] },
        current,
        { ...current, title: "Restored" },
      ),
    ).toBeNull();
    expect(
      buildDesiredIndexBody(
        { projects: [current, current] },
        current,
        { ...current, title: "Restored" },
      ),
    ).toBeNull();
  });
});
