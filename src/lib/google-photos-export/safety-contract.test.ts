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
    expect(workflow).toContain("assertGooglePhotosExportPlanIsImageOnly");
    expect(workflow).toContain('item.mediaKind !== "image"');
    expect(workflow).not.toContain("uploadVideoFromAuthoritativeOffset");
    expect(renderer).not.toContain("video/mp4");
  });

  it("does not encode full-size images as base64 data URLs", () => {
    const renderer =
      files.find((file) => file.name === "image-renderer.ts")?.source ?? "";
    const workflow =
      files.find((file) => file.name === "workflow.ts")?.source ?? "";
    const layout =
      files.find((file) => file.name === "caption-layout.ts")?.source ?? "";
    for (const source of [renderer, workflow, layout]) {
      expect(source).not.toContain("toDataURL");
      expect(source).not.toContain("FileReader");
      expect(source).not.toContain("readAsDataURL");
    }
    expect(renderer).not.toContain(".arrayBuffer(");
    expect(renderer).toContain("GOOGLE_PHOTOS_WEBP_PROBE_CANVAS_SIZE");
    expect(renderer).toContain('canvas.toBlob');
  });

  it("does not silently truncate burned-in captions", () => {
    const layout =
      files.find((file) => file.name === "caption-layout.ts")?.source ?? "";
    const renderer =
      files.find((file) => file.name === "image-renderer.ts")?.source ?? "";
    expect(layout).not.toContain("packCaptionLines");
    expect(layout).not.toContain("ellipsis");
    expect(layout).toContain("doesNotFit");
    expect(layout).toContain("GOOGLE_PHOTOS_CAPTION_ABSOLUTE_MIN_FONT_SIZE");
    expect(renderer).toContain('layout.kind === "doesNotFit"');
  });

  it("builds image source Blobs from stream chunks without an extra merged copy", () => {
    const workflow =
      files.find((file) => file.name === "workflow.ts")?.source ?? "";
    expect(workflow).toContain("return new Blob(chunks, { type: mimeType })");
    expect(workflow).not.toContain("new Uint8Array(totalBytes)");
    expect(workflow).not.toContain("merged.set");
  });

  it("rejects video items before any Photos upload starts", () => {
    const workflow =
      files.find((file) => file.name === "workflow.ts")?.source ?? "";
    expect(workflow).toContain("assertGooglePhotosExportPlanIsImageOnly");
    expect(workflow).not.toContain("async function uploadVideoFromAuthoritativeOffset");
    expect(workflow).not.toContain("uploadGooglePhotosResumableStream({\n    stream,");
    expect(workflow).toContain("collectStreamBlob");
  });

  it("keeps Photos export authorization appendonly-only", () => {
    const auth =
      files.find((file) => file.name === "authorization.ts")?.source ?? "";
    expect(auth).toContain(
      "export const GOOGLE_PHOTOS_EXPORT_SCOPE = PHOTOS_LIBRARY_APPENDONLY_SCOPE",
    );
    expect(auth).toContain(
      "!scopes.includes(PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE)",
    );
    expect(auth).not.toContain("include_granted_scopes");
  });
});
