import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseProjectManifest,
  duplicateDriveProjectSlide,
  stringifyProjectManifestJson,
  updateDriveProjectSlideCaption,
  updateDriveProjectSlideImageEdit,
  updateDriveProjectTransition,
  type DriveProjectSummary,
  type ProjectManifest,
} from "./google-drive";
import { getProjectManifestContentCanonicalHash } from "./publish-history/project-publish-revision";

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
}) {
  let manifestText = stringifyProjectManifestJson(input.manifest);
  let indexText = indexJsonText(input.manifest.updatedAt);

  const fetchMock = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request);
    const method = init?.method ?? "GET";

    if (method === "PATCH") {
      const nextJson = extractMultipartJson(String(init?.body ?? ""));
      if (url.includes(MANIFEST_FILE_ID)) {
        manifestText = nextJson.endsWith("\n") ? nextJson : `${nextJson}\n`;
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

describe("parseProjectManifest transition", () => {
  it("keeps absent transition valid as legacy undefined", () => {
    const result = parseProjectManifest(manifest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.transition).toBeUndefined();
  });

  it.each([
    "none",
    "fade",
    "slideLeft",
    "slideRight",
    "slideUp",
    "wipe",
    "zoom",
    "blur",
  ] as const)(
    "accepts explicit %s",
    (transition) => {
      const result = parseProjectManifest(manifest({ transition }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.transition).toBe(transition);
    },
  );

  it("keeps first-phase transition-only manifests valid without adding strength", () => {
    const result = parseProjectManifest(manifest({ transition: "fade" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.transition).toBe("fade");
    expect(result.value.transitionStrength).toBeUndefined();
    expect(result.value).not.toHaveProperty("transitionStrength");
  });

  it.each(["subtle", "standard", "strong"] as const)(
    "accepts transitionStrength %s with an explicit effect",
    (transitionStrength) => {
      const result = parseProjectManifest(
        manifest({ transition: "wipe", transitionStrength }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.transitionStrength).toBe(transitionStrength);
    },
  );

  it("rejects an unknown transition", () => {
    const result = parseProjectManifest({
      ...manifest(),
      transition: "dissolve",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown strength", () => {
    const result = parseProjectManifest({
      ...manifest(),
      transition: "fade",
      transitionStrength: "medium",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects strength without an explicit animated effect", () => {
    expect(
      parseProjectManifest({
        ...manifest(),
        transitionStrength: "standard",
      }).ok,
    ).toBe(false);
    expect(
      parseProjectManifest({
        ...manifest(),
        transition: "none",
        transitionStrength: "standard",
      }).ok,
    ).toBe(false);
  });

  it("does not convert absent transition to none when stringifying", () => {
    const text = stringifyProjectManifestJson(manifest());
    expect(text).not.toContain("transition");
    expect(JSON.parse(text).transition).toBeUndefined();
  });
});

describe("parseProjectManifest imageEdit", () => {
  it("keeps legacy absent imageEdit valid and round-trips valid edits", () => {
    const legacy = parseProjectManifest(manifest());
    expect(legacy.ok).toBe(true);
    if (!legacy.ok) return;
    expect(legacy.value.slides[0]).not.toHaveProperty("imageEdit");

    const edited = manifest();
    edited.slides[0]!.imageEdit = {
      rotation: 90,
      crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
    };
    const result = parseProjectManifest(
      JSON.parse(stringifyProjectManifestJson(edited)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slides[0]?.imageEdit).toEqual(
      edited.slides[0]?.imageEdit,
    );
  });

  it("rejects invalid crop values and video slides with imageEdit", () => {
    const invalidCrop = manifest();
    invalidCrop.slides[0]!.imageEdit = {
      rotation: 0,
      crop: { x: 0.8, y: 0, width: 0.4, height: 1 },
    };
    expect(parseProjectManifest(invalidCrop).ok).toBe(false);

    const video = manifest();
    video.slides[0] = {
      ...video.slides[0]!,
      type: "video",
      mimeType: "video/mp4",
      sourceMimeType: "video/mp4",
      imageEdit: { rotation: 90 },
    };
    expect(parseProjectManifest(video).ok).toBe(false);
  });
});

describe("manifest rewrite preserves transition", () => {
  it("keeps transition and publication across an unrelated caption mutation", async () => {
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue(NOW);
    const current = manifest({
      transition: "zoom",
      transitionStrength: "subtle",
      publication: PUBLICATION,
    });
    current.publication = {
      ...PUBLICATION,
      contentCanonicalHash: getProjectManifestContentCanonicalHash(current),
    };
    current.slides[0]!.imageEdit = {
      rotation: 270,
      crop: { x: 0.1, y: 0.15, width: 0.7, height: 0.75 },
    };
    const harness = stubManifestAndIndex({ manifest: current });

    await updateDriveProjectSlideCaption({
      accessToken: "access-token",
      workspaceId: WORKSPACE_ID,
      indexJsonFileId: INDEX_FILE_ID,
      project: PROJECT,
      slideId: SLIDE_ID,
      caption: "Changed",
      runStep: (operation) => operation(new AbortController().signal),
    });

    const next = harness.readManifest();
    expect(next.transition).toBe("zoom");
    expect(next.transitionStrength).toBe("subtle");
    expect(next.publication).toEqual(current.publication);
    expect(next.slides[0]?.caption).toBe("Changed");
    expect(next.slides[0]?.imageEdit).toEqual(current.slides[0]?.imageEdit);
    expect(next.updatedAt).toBe(NOW);
    expect(harness.readIndex()).not.toHaveProperty("transition");
    expect(
      (harness.readIndex().projects as DriveProjectSummary[])[0],
    ).not.toHaveProperty("transition");
  });

  it("saves and verifies canonical imageEdit without changing the asset", async () => {
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue(NOW);
    const current = manifest({ transition: "wipe" });
    const harness = stubManifestAndIndex({ manifest: current });

    const result = await updateDriveProjectSlideImageEdit({
      accessToken: "access-token",
      workspaceId: WORKSPACE_ID,
      indexJsonFileId: INDEX_FILE_ID,
      project: PROJECT,
      slideId: SLIDE_ID,
      imageEdit: {
        rotation: 90,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      },
      runStep: (operation) => operation(new AbortController().signal),
    });

    expect(result.imageEdit).toEqual({ rotation: 90 });
    expect(harness.readManifest().slides[0]?.imageEdit).toEqual({ rotation: 90 });
    expect(harness.readManifest().slides[0]?.assetFileId).toBe(
      current.slides[0]?.assetFileId,
    );
    expect(harness.readManifest().transition).toBe("wipe");

    const reset = await updateDriveProjectSlideImageEdit({
      accessToken: "access-token",
      workspaceId: WORKSPACE_ID,
      indexJsonFileId: INDEX_FILE_ID,
      project: { ...PROJECT, updatedAt: NOW },
      slideId: SLIDE_ID,
      imageEdit: {
        rotation: 0,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      },
      runStep: (operation) => operation(new AbortController().signal),
    });
    expect(reset.imageEdit).toBeUndefined();
    expect(harness.readManifest().slides[0]).not.toHaveProperty("imageEdit");
  });

  it("copies imageEdit when duplicating a slide", async () => {
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue(NOW);
    const current = manifest();
    current.slides[0]!.imageEdit = {
      rotation: 180,
      crop: { x: 0.2, y: 0.1, width: 0.6, height: 0.7 },
    };
    const harness = stubManifestAndIndex({ manifest: current });

    const result = await duplicateDriveProjectSlide({
      accessToken: "access-token",
      workspaceId: WORKSPACE_ID,
      indexJsonFileId: INDEX_FILE_ID,
      project: PROJECT,
      slideId: SLIDE_ID,
      runStep: (operation) => operation(new AbortController().signal),
    });

    expect(result.duplicatedSlide.imageEdit).toEqual(
      current.slides[0]?.imageEdit,
    );
    expect(harness.readManifest().slides).toHaveLength(2);
    expect(harness.readManifest().slides[1]?.imageEdit).toEqual(
      current.slides[0]?.imageEdit,
    );
  });

  it("rewrites transition with readback and updatedAt while leaving index without transition", async () => {
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue(NOW);
    const current = manifest({
      transition: "fade",
      publication: PUBLICATION,
    });
    const harness = stubManifestAndIndex({ manifest: current });

    const result = await updateDriveProjectTransition({
      accessToken: "access-token",
      workspaceId: WORKSPACE_ID,
      indexJsonFileId: INDEX_FILE_ID,
      project: PROJECT,
      transition: "slideLeft",
      runStep: (operation) => operation(new AbortController().signal),
    });

    expect(result.transition).toBe("slideLeft");
    expect(result.details.transition).toBe("slideLeft");
    const next = harness.readManifest();
    expect(next.transition).toBe("slideLeft");
    expect(next.transitionStrength).toBe("standard");
    expect(next.publication).toEqual(PUBLICATION);
    expect(next.updatedAt).toBe(NOW);
    expect(result.project.updatedAt).toBe(NOW);
    const index = harness.readIndex();
    expect(index).not.toHaveProperty("transition");
    expect(index).not.toHaveProperty("transitionStrength");
    expect((index.projects as DriveProjectSummary[])[0]?.updatedAt).toBe(NOW);
    expect((index.projects as DriveProjectSummary[])[0]).not.toHaveProperty(
      "transition",
    );
    expect((index.projects as DriveProjectSummary[])[0]).not.toHaveProperty(
      "transitionStrength",
    );
  });

  it("writes effect and strength in one flow and omits strength for none or standard", async () => {
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue(NOW);
    const harness = stubManifestAndIndex({
      manifest: manifest({ transition: "fade" }),
    });

    const result = await updateDriveProjectTransition({
      accessToken: "access-token",
      workspaceId: WORKSPACE_ID,
      indexJsonFileId: INDEX_FILE_ID,
      project: PROJECT,
      transition: "blur",
      transitionStrength: "strong",
      runStep: (operation) => operation(new AbortController().signal),
    });

    expect(result.transition).toBe("blur");
    expect(result.transitionStrength).toBe("strong");
    expect(harness.readManifest().transition).toBe("blur");
    expect(harness.readManifest().transitionStrength).toBe("strong");
    expect(harness.fetchMock.mock.calls.filter(([request, init]) => {
      void request;
      return (init?.method ?? "GET") === "PATCH";
    })).toHaveLength(2);

    const omitted = await updateDriveProjectTransition({
      accessToken: "access-token",
      workspaceId: WORKSPACE_ID,
      indexJsonFileId: INDEX_FILE_ID,
      project: { ...PROJECT, updatedAt: NOW },
      transition: "none",
      transitionStrength: "strong",
      runStep: (operation) => operation(new AbortController().signal),
    });
    expect(omitted.transition).toBe("none");
    expect(omitted.transitionStrength).toBeUndefined();
    expect(harness.readManifest().transition).toBe("none");
    expect(harness.readManifest()).not.toHaveProperty("transitionStrength");
  });

  it("omits transition when saving 標準 / undefined and does not silent-repair", async () => {
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue(NOW);
    const harness = stubManifestAndIndex({
      manifest: manifest({ transition: "none" }),
    });

    const result = await updateDriveProjectTransition({
      accessToken: "access-token",
      workspaceId: WORKSPACE_ID,
      indexJsonFileId: INDEX_FILE_ID,
      project: PROJECT,
      transition: undefined,
      runStep: (operation) => operation(new AbortController().signal),
    });

    expect(result.transition).toBeUndefined();
    expect(result.transitionStrength).toBeUndefined();
    expect(harness.readManifest().transition).toBeUndefined();
    expect(JSON.stringify(harness.readManifest())).not.toContain('"transition"');
    expect(JSON.stringify(harness.readManifest())).not.toContain(
      '"transitionStrength"',
    );
  });

  it("keeps first-phase transition-only data through an unrelated rewrite", async () => {
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue(NOW);
    const current = manifest({
      transition: "fade",
      publication: PUBLICATION,
    });
    const harness = stubManifestAndIndex({ manifest: current });

    await updateDriveProjectSlideCaption({
      accessToken: "access-token",
      workspaceId: WORKSPACE_ID,
      indexJsonFileId: INDEX_FILE_ID,
      project: PROJECT,
      slideId: SLIDE_ID,
      caption: "Kept",
      runStep: (operation) => operation(new AbortController().signal),
    });

    const next = harness.readManifest();
    expect(next.transition).toBe("fade");
    expect(next).not.toHaveProperty("transitionStrength");
  });
});

describe("manifest rewrite helpers keep optional settings", () => {
  it("copies transition through every manifest rewrite helper", () => {
    const drive = readFileSync(new URL("./google-drive.ts", import.meta.url), "utf8");
    const helperNames = [
      "buildProjectManifestJsonWithAppendedSlides",
      "buildProjectManifestJsonWithUpdatedSlideCaption",
      "buildProjectManifestJsonWithUpdatedSlideImageEdit",
      "buildProjectManifestJsonWithUpdatedSlideDuration",
      "buildProjectManifestJsonWithReorderedSlides",
      "buildProjectManifestJsonWithDeletedSlides",
      "buildProjectManifestJsonWithDuplicatedSlide",
      "buildProjectManifestJsonWithUpdatedTitle",
    ];

    expect(drive).toContain(
      "return buildProjectManifestJsonWithAppendedSlides({",
    );

    for (const name of helperNames) {
      const start = drive.indexOf(`function ${name}(`);
      expect(start).toBeGreaterThan(-1);
      const block = drive.slice(start, start + 1200);
      expect(block).toContain("withProjectManifestOptionalSettings(input.manifest)");
    }

    const newSlideBuilder = drive.slice(
      drive.indexOf("function buildDriveProjectManifestSlide("),
      drive.indexOf("function parseDriveProjectManifestJson("),
    );
    expect(newSlideBuilder).not.toContain("imageEdit");
  });
});
