import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseProjectManifest,
  duplicateDriveProjectSlide,
  stringifyProjectManifestJson,
  updateDriveProjectSlideCaption,
  updateDriveProjectSlideEdits,
  updateDriveProjectSlideImageEdit,
  updateDriveProjectTransition,
  updateDriveProjectCaptionStyle,
  updateDriveProjectTitle,
  updateDriveProjectSlideDuration,
  reorderDriveProjectSlides,
  deleteDriveProjectSlides,
  appendDriveProjectAssetToManifest,
  appendDriveProjectAssetsToManifest,
  type DriveProjectSummary,
  type ProjectManifest,
} from "./google-drive";
import { DEFAULT_PROJECT_SLIDE_CAPTION_STYLE as DEFAULT_STYLE } from "./project-slide-caption-style";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const SLIDE_ID = "55555555-5555-4555-8555-555555555555";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const CREATED_AT = "2026-08-22T00:00:00.000Z";
const UPDATED_AT = "2026-08-22T01:00:00.000Z";
const NOW = "2026-08-29T04:16:00.000Z";
const INDEX_FILE_ID = "index-file-id-fixture";
const MANIFEST_FILE_ID = "manifest-file-id-fixture";

const PROJECT: DriveProjectSummary = {
  projectId: PROJECT_ID,
  title: "Demo",
  projectFolderId: "project-folder-id-fixture",
  manifestFileId: MANIFEST_FILE_ID,
  assetsFolderId: "assets-folder-id-fixture",
  manifestPath: `projects/${PROJECT_ID}/manifest.json`,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

const PUBLICATION = {
  schemaVersion: 1 as const,
  currentRevisionId: "rev_20260822T010000000Z_ab12cd34",
  publishedAt: UPDATED_AT,
  operation: "publish" as const,
  operationId: "pubop_20260822T010000000Z_abcdef12",
  contentCanonicalHash: "fnv1a64:0123456789abcdef",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function slide() {
  return {
    slideId: SLIDE_ID,
    assetId: ASSET_ID,
    assetFileId: "asset-file-id-fixture",
    assetName: "photo.jpg",
    type: "image" as const,
    mimeType: "image/jpeg",
    source: "localFile" as const,
    sourceMimeType: "image/jpeg",
    sourceMediaItemId: "source-photo",
    fileSize: 1200,
    durationSeconds: 10,
    caption: "Opening",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function manifest(
  extra: Partial<ProjectManifest> = {},
): ProjectManifest {
  return {
    app: "ipad-slideshow-pwa",
    role: "projectManifest",
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    title: "Demo",
    slides: [slide()],
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...extra,
  };
}

function indexJsonText(updatedAt = UPDATED_AT) {
  return `${JSON.stringify(
    {
      app: "ipad-slideshow-pwa",
      role: "index",
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      projects: [{ ...PROJECT, updatedAt }],
      createdAt: CREATED_AT,
      updatedAt,
    },
    null,
    2,
  )}\n`;
}

function jsonFileResponse(input: {
  id: string;
  name: string;
  role: "projectManifest" | "index";
}) {
  return {
    id: input.id,
    name: input.name,
    mimeType: "application/json",
    appProperties: {
      app: "ipad-slideshow-pwa",
      role: input.role,
      schemaVersion: "1",
      workspaceId: WORKSPACE_ID,
      ...(input.role === "projectManifest" ? { projectId: PROJECT_ID } : {}),
    },
  };
}

function extractMultipartJson(body: string) {
  const parts = body.split(/\r\n--/);
  for (const part of [...parts].reverse()) {
    const start = part.indexOf("{");
    if (start === -1) {
      continue;
    }
    const json = part.slice(start).trim();
    if (json.startsWith("{") && json.includes('"role"')) {
      return json.endsWith("\n") ? json : `${json}\n`;
    }
  }
  throw new Error("multipart json was missing");
}

function stubManifestAndIndex(input: {
  manifest: ProjectManifest;
  fault?: "readback" | "indexPatch" | "auth";
}) {
  let manifestText = stringifyProjectManifestJson(input.manifest);
  let indexText = indexJsonText(input.manifest.updatedAt);

  const fetchMock = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request);
    const method = init?.method ?? "GET";
    if (input.fault === "auth") return new Response(null, { status: 401 });
    if (input.fault === "indexPatch" && method === "PATCH" && url.includes(INDEX_FILE_ID)) return new Response(null, { status: 500 });
    if (new URL(url).searchParams.has("q")) return new Response(JSON.stringify({ files: [] }));

    if (method === "PATCH") {
      const nextJson = extractMultipartJson(String(init?.body ?? ""));
      if (url.includes(MANIFEST_FILE_ID)) {
        manifestText = nextJson.endsWith("\n") ? nextJson : `${nextJson}\n`;
        if (input.fault === "readback") {
          const stale = JSON.parse(manifestText);
          delete stale.captionStyle;
          manifestText = JSON.stringify(stale);
        }
        return new Response(
          JSON.stringify(
            jsonFileResponse({
              id: MANIFEST_FILE_ID,
              name: "manifest.json",
              role: "projectManifest",
            }),
          ),
        );
      }
      if (url.includes(INDEX_FILE_ID)) {
        indexText = nextJson.endsWith("\n") ? nextJson : `${nextJson}\n`;
        return new Response(
          JSON.stringify(
            jsonFileResponse({
              id: INDEX_FILE_ID,
              name: "index.json",
              role: "index",
            }),
          ),
        );
      }
    }

    if (url.includes(MANIFEST_FILE_ID)) {
      return new Response(manifestText);
    }
    if (url.includes(INDEX_FILE_ID)) {
      return new Response(indexText);
    }

    return new Response(null, { status: 404 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    readManifest: () => JSON.parse(manifestText) as ProjectManifest,
    readIndex: () => JSON.parse(indexText) as Record<string, unknown>,
  };
}


const CUSTOM_STYLE = { position: "top", shape: "band", size: "large", colorPreset: "yellowOnBlack" } as const;
const common = () => ({
  accessToken: "fixture-token", workspaceId: WORKSPACE_ID, indexJsonFileId: INDEX_FILE_ID, project: PROJECT,
  runStep: <T>(operation: (signal: AbortSignal) => Promise<T>) => operation(new AbortController().signal),
});
const patches = (h: ReturnType<typeof stubManifestAndIndex>) => h.fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");

describe("captionStyle manifest update", () => {
  it("round-trips custom and explicit default styles while legacy absence remains valid", () => {
    for (const style of [CUSTOM_STYLE, DEFAULT_STYLE]) {
      const result = parseProjectManifest(JSON.parse(stringifyProjectManifestJson(manifest({ captionStyle: style }))));
      expect(result).toMatchObject({ ok: true, value: { captionStyle: style, schemaVersion: 1 } });
    }
    const result = parseProjectManifest(manifest());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).not.toHaveProperty("captionStyle");
  });
  it.each([null, [], {}, { ...CUSTOM_STYLE, position: "invalid" }])("rejects invalid manifest style %#", (captionStyle) => {
    expect(parseProjectManifest({ ...manifest(), captionStyle }).ok).toBe(false);
  });
  it("writes custom style, mirrors updatedAt to index and verifies readback", async () => {
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue(NOW);
    const h = stubManifestAndIndex({ manifest: manifest({ transition: "fade", publication: PUBLICATION }) });
    const result = await updateDriveProjectCaptionStyle({ ...common(), captionStyle: CUSTOM_STYLE });
    expect(result).toMatchObject({ didWrite: true, captionStyle: CUSTOM_STYLE, details: { captionStyle: CUSTOM_STYLE } });
    expect(h.readManifest()).toMatchObject({ captionStyle: CUSTOM_STYLE, transition: "fade", publication: PUBLICATION, updatedAt: NOW });
    expect(h.readIndex().projects).toMatchObject([{ updatedAt: NOW }]);
    expect(h.readIndex()).not.toHaveProperty("captionStyle");
    expect((h.readIndex().projects as unknown[])[0]).not.toHaveProperty("captionStyle");
    expect(patches(h)).toHaveLength(2);
  });
  it("removes captionStyle when returning to default", async () => {
    const h = stubManifestAndIndex({ manifest: manifest({ captionStyle: CUSTOM_STYLE }) });
    const result = await updateDriveProjectCaptionStyle({ ...common(), captionStyle: DEFAULT_STYLE });
    expect(result.didWrite).toBe(true);
    expect(h.readManifest()).not.toHaveProperty("captionStyle");
    expect(result.details).not.toHaveProperty("captionStyle");
  });
  it.each([[undefined, DEFAULT_STYLE], [DEFAULT_STYLE, undefined], [CUSTOM_STYLE, CUSTOM_STYLE]] as const)("does not write effectively equal styles %#", async (saved, draft) => {
    const h = stubManifestAndIndex({ manifest: manifest(saved ? { captionStyle: saved } : {}) });
    expect((await updateDriveProjectCaptionStyle({ ...common(), captionStyle: draft })).didWrite).toBe(false);
    expect(patches(h)).toHaveLength(0);
  });
  it("rejects invalid input before I/O", async () => {
    const h = stubManifestAndIndex({ manifest: manifest() });
    await expect(updateDriveProjectCaptionStyle({ ...common(), captionStyle: {} as never })).rejects.toMatchObject({ status: "invalidProject" });
    expect(h.fetchMock).not.toHaveBeenCalled();
  });
  it.each([["readback", "verificationFailed"], ["indexPatch", "indexUpdateFailed"], ["auth", "authRequired"]] as const)("reports %s failure without retry or repair", async (fault, status) => {
    const h = stubManifestAndIndex({ manifest: manifest(), fault });
    await expect(updateDriveProjectCaptionStyle({ ...common(), captionStyle: CUSTOM_STYLE })).rejects.toMatchObject({ status });
    expect(patches(h).length).toBeLessThanOrEqual(2);
  });
  it("fails closed for stale registration before writes", async () => {
    const h = stubManifestAndIndex({ manifest: manifest({ updatedAt: NOW }) });
    await expect(updateDriveProjectCaptionStyle({ ...common(), captionStyle: CUSTOM_STYLE })).rejects.toMatchObject({ status: "invalidProject" });
    expect(patches(h)).toHaveLength(0);
  });
});

const savedAsset = {
  assetId: "44444444-4444-4444-8444-444444444444", assetIdPart: "fixture", assetFileId: "new-file", assetFileIdPart: "fixture", driveFilename: "new.jpg", driveMimeType: "image/jpeg" as const, driveSizeBytes: 100, diagnostics: [],
};
const source = { source: "localFile" as const, filename: "new.jpg", sourceMimeType: "image/jpeg", sourceMediaItemId: "new", sourceCreateTime: null };
const writers = {
  "slide edits": () => updateDriveProjectSlideEdits({ ...common(), slideId: SLIDE_ID, caption: "Updated", durationSeconds: 12, imageEdit: { rotation: 90 } }),
  caption: () => updateDriveProjectSlideCaption({ ...common(), slideId: SLIDE_ID, caption: "Updated" }),
  duration: () => updateDriveProjectSlideDuration({ ...common(), slideId: SLIDE_ID, durationSeconds: 12 }),
  "image edit": () => updateDriveProjectSlideImageEdit({ ...common(), slideId: SLIDE_ID, imageEdit: { rotation: 90 } }),
  title: () => updateDriveProjectTitle({ ...common(), title: "Renamed", projectsRootFolderId: "projects-folder" }),
  transition: () => updateDriveProjectTransition({ ...common(), transition: "wipe", transitionStrength: "strong" }),
  reorder: () => reorderDriveProjectSlides({ ...common(), orderedSlideIds: ["66666666-6666-4666-8666-666666666666", SLIDE_ID] }),
  delete: () => deleteDriveProjectSlides({ ...common(), slideIds: [SLIDE_ID] }),
  duplicate: () => duplicateDriveProjectSlide({ ...common(), slideId: SLIDE_ID }),
  append: () => appendDriveProjectAssetToManifest({ ...common(), signal: new AbortController().signal, savedAsset, source }),
  "batch append": () => appendDriveProjectAssetsToManifest({ ...common(), signal: new AbortController().signal, savedAssets: [{ savedAsset, source }] }),
};
describe("captionStyle preservation in manifest writers", () => {
  it.each(Object.entries(writers))("preserves custom settings through %s", async (_name, write) => {
    const current = manifest({ captionStyle: CUSTOM_STYLE, publication: PUBLICATION, transition: "fade" });
    current.slides.push({ ...slide(), slideId: "66666666-6666-4666-8666-666666666666" });
    const h = stubManifestAndIndex({ manifest: current });
    const result = await write();
    expect(h.readManifest().captionStyle).toEqual(CUSTOM_STYLE);
    expect(result.details.captionStyle).toEqual(CUSTOM_STYLE);
    expect(patches(h).length).toBeGreaterThan(0);
  });
  it("shares optional setting preservation across all rewrite builders", () => {
    const drive = readFileSync(new URL("./google-drive.ts", import.meta.url), "utf8");
    const helper = drive.slice(drive.indexOf("function withProjectManifestOptionalSettings("), drive.indexOf("function buildProjectManifestJsonWithUpdatedCaptionStyle("));
    expect(helper).toContain("pickProjectSlideCaptionStyle(manifest)");
    for (const name of ["AppendedSlides", "UpdatedSlideEdits", "UpdatedSlideCaption", "UpdatedSlideDuration", "UpdatedSlideImageEdit", "UpdatedTitle", "UpdatedTransition", "ReorderedSlides", "DeletedSlides", "DuplicatedSlide"]) {
      const start = drive.indexOf(`function buildProjectManifestJsonWith${name}(`);
      expect(start).toBeGreaterThan(-1);
      expect(drive.slice(start, drive.indexOf("\nfunction ", start + 10))).toContain("withProjectManifestOptionalSettings(");
    }
  });
});
