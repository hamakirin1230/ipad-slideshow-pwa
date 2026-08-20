import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = [
  "contract.ts",
  "authorization.ts",
  "drive-source.ts",
  "drive-media.ts",
  "resumable-upload.ts",
  "library-api.ts",
  "workflow.ts",
  "caption-layout.ts",
  "image-renderer.ts",
].map((name) => ({
  name,
  source: readFileSync(new URL(`./${name}`, import.meta.url), "utf8"),
}));

describe("google photos export safety contract", () => {
  it("does not change Drive publication or offline store semantics", () => {
    for (const file of files) {
      expect(file.source).not.toContain("currentRevisionId");
      expect(file.source).not.toContain("executePreparedProjectPublish");
      expect(file.source).not.toContain("executePreparedProjectRollback");
      expect(file.source).not.toContain("startOfflineSync");
      expect(file.source).not.toContain("confirmedStore");
      expect(file.source).not.toContain("index.json");
    }
  });

  it("does not accumulate Drive media as a whole-file Blob", () => {
    const media = files.find((file) => file.name === "drive-media.ts")?.source ?? "";
    expect(media).toContain("response.body");
    expect(media).not.toContain(".blob()");
    expect(media).not.toContain(".arrayBuffer()");
  });

  it("keeps Drive source preflight free of Photos upload APIs", () => {
    const source =
      files.find((file) => file.name === "drive-source.ts")?.source ?? "";
    expect(source).not.toContain("photoslibrary.googleapis.com");
    expect(source).not.toContain("/v1/uploads");
    expect(source).not.toContain("startGooglePhotosResumableSession");
    expect(source).not.toContain("queryGooglePhotosResumableSession");
  });

  it("does not persist rendered images or access tokens", () => {
    const renderer =
      files.find((file) => file.name === "image-renderer.ts")?.source ?? "";
    const workflow =
      files.find((file) => file.name === "workflow.ts")?.source ?? "";
    for (const source of [renderer, workflow]) {
      expect(source).not.toContain("localStorage");
      expect(source).not.toContain("sessionStorage");
      expect(source).not.toContain("indexedDB");
      expect(source).not.toContain("document.cookie");
    }
    expect(workflow).toContain('item.mediaKind === "video"');
    expect(renderer).not.toContain("video/mp4");
  });
});
