import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseProjectManifest,
  stringifyProjectManifestJson,
  updateDriveProjectSlideCaption,
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

  it.each(["none", "fade", "slideLeft", "zoom"] as const)(
    "accepts explicit %s",
    (transition) => {
      const result = parseProjectManifest(manifest({ transition }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.transition).toBe(transition);
    },
  );

  it("rejects an unknown transition", () => {
    const result = parseProjectManifest({
      ...manifest(),
      transition: "wipe",
    });
    expect(result.ok).toBe(false);
  });

  it("does not convert absent transition to none when stringifying", () => {
    const text = stringifyProjectManifestJson(manifest());
    expect(text).not.toContain("transition");
    expect(JSON.parse(text).transition).toBeUndefined();
  });
});

describe("manifest rewrite preserves transition", () => {
  it("keeps transition and publication across an unrelated caption mutation", async () => {
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue(NOW);
    const current = manifest({
      transition: "zoom",
      publication: PUBLICATION,
    });
    current.publication = {
      ...PUBLICATION,
      contentCanonicalHash: getProjectManifestContentCanonicalHash(current),
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
    expect(next.publication).toEqual(current.publication);
    expect(next.slides[0]?.caption).toBe("Changed");
    expect(next.updatedAt).toBe(NOW);
    expect(harness.readIndex()).not.toHaveProperty("transition");
    expect(
      (harness.readIndex().projects as DriveProjectSummary[])[0],
    ).not.toHaveProperty("transition");
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
    expect(next.publication).toEqual(PUBLICATION);
    expect(next.updatedAt).toBe(NOW);
    expect(result.project.updatedAt).toBe(NOW);
    const index = harness.readIndex();
    expect(index).not.toHaveProperty("transition");
    expect((index.projects as DriveProjectSummary[])[0]?.updatedAt).toBe(NOW);
    expect((index.projects as DriveProjectSummary[])[0]).not.toHaveProperty(
      "transition",
    );
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
    expect(harness.readManifest().transition).toBeUndefined();
    expect(JSON.stringify(harness.readManifest())).not.toContain('"transition"');
  });
});

describe("manifest rewrite helpers keep optional settings", () => {
  it("copies transition through every manifest rewrite helper", () => {
    const drive = readFileSync(new URL("./google-drive.ts", import.meta.url), "utf8");
    const helperNames = [
      "buildProjectManifestJsonWithAppendedSlides",
      "buildProjectManifestJsonWithUpdatedSlideCaption",
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
  });
});
