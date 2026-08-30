import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { DriveFileCandidate } from "../google-drive";
import {
  buildDrivePhotosSyncBindingAppProperties,
  buildDrivePhotosSyncBindingQuery,
  createDrivePhotosSyncBinding,
  readDrivePhotosSyncBinding,
  updateDrivePhotosSyncBindingBestEffort,
  type DrivePhotosSyncBindingAdapter,
} from "./drive-sync-binding";
import {
  buildEmptyGooglePhotosSyncBinding,
  stringifyGooglePhotosSyncBinding,
  type GooglePhotosSyncBinding,
} from "./sync-binding";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ROOT_ID = "project-root-file";
const FILE_ID = "binding-file";

function binding(generation = 1): GooglePhotosSyncBinding {
  return {
    ...buildEmptyGooglePhotosSyncBinding({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    }),
    album: {
      albumId: "photos-album",
      createdAt: "2026-08-30T01:00:00.000Z",
      lastKnownTitle: "作品",
    },
    stable: {
      generation,
      completedAt: "2026-08-30T01:10:00.000Z",
      rendererVersion: 1,
      items: [],
    },
  };
}

function candidate(
  overrides: Partial<DriveFileCandidate> = {},
): DriveFileCandidate {
  return {
    id: FILE_ID,
    name: "google-photos-sync.json",
    mimeType: "application/json",
    trashed: false,
    parents: [PROJECT_ROOT_ID],
    sizeBytes: 500,
    appProperties: buildDrivePhotosSyncBindingAppProperties({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    }),
    ...overrides,
  };
}

function adapter(input: {
  pages?: Array<{ files: DriveFileCandidate[]; hasMore?: boolean }>;
  texts?: string[];
  listError?: unknown;
  readError?: unknown;
  createError?: unknown;
  updateError?: unknown;
} = {}): DrivePhotosSyncBindingAdapter & {
  listCandidates: ReturnType<typeof vi.fn>;
  readText: ReturnType<typeof vi.fn>;
  createJson: ReturnType<typeof vi.fn>;
  updateJson: ReturnType<typeof vi.fn>;
} {
  const pages = [...(input.pages ?? [{ files: [] }])];
  const texts = [...(input.texts ?? [])];
  return {
    listCandidates: vi.fn(async () => {
      if (input.listError) throw input.listError;
      const page = pages.shift() ?? pages.at(-1) ?? { files: [] };
      return { files: page.files, hasMore: page.hasMore === true };
    }),
    readText: vi.fn(async () => {
      if (input.readError) throw input.readError;
      return texts.shift() ?? "{";
    }),
    createJson: vi.fn(async () => {
      if (input.createError) throw input.createError;
    }),
    updateJson: vi.fn(async () => {
      if (input.updateError) throw input.updateError;
    }),
  };
}

function readInput() {
  return {
    accessToken: "test-access-token",
    projectRootFolderId: PROJECT_ROOT_ID,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    signal: new AbortController().signal,
  };
}

describe("Drive Google Photos sync binding read", () => {
  it("queries the project root with exact app ownership metadata", () => {
    const query = buildDrivePhotosSyncBindingQuery({
      projectRootFolderId: "root'with\\characters",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    });

    expect(query).toContain("'root\\'with\\\\characters' in parents");
    expect(query).toContain("trashed = false");
    expect(query).toContain("key='app' and value='ipad-slideshow-pwa'");
    expect(query).toContain("key='role' and value='googlePhotosSync'");
    expect(query).toContain("key='schemaVersion' and value='1'");
    expect(query).toContain(`key='workspaceId' and value='${WORKSPACE_ID}'`);
    expect(query).toContain(`key='projectId' and value='${PROJECT_ID}'`);
  });

  it("classifies zero, one, and multiple candidates without repair", async () => {
    const emptyAdapter = adapter();
    await expect(
      readDrivePhotosSyncBinding(readInput(), emptyAdapter),
    ).resolves.toEqual({ status: "unbound" });

    const value = binding();
    const readyAdapter = adapter({
      pages: [{ files: [candidate()] }],
      texts: [stringifyGooglePhotosSyncBinding(value)],
    });
    await expect(
      readDrivePhotosSyncBinding(readInput(), readyAdapter),
    ).resolves.toEqual({ status: "ready", fileId: FILE_ID, binding: value });

    const duplicateAdapter = adapter({
      pages: [{ files: [candidate(), candidate({ id: "second-file" })] }],
    });
    await expect(
      readDrivePhotosSyncBinding(readInput(), duplicateAdapter),
    ).resolves.toEqual({ status: "duplicate" });
    expect(duplicateAdapter.readText).not.toHaveBeenCalled();
    expect(duplicateAdapter.updateJson).not.toHaveBeenCalled();
  });

  it("fails closed for candidate metadata mismatch and malformed body", async () => {
    const metadataAdapter = adapter({
      pages: [
        {
          files: [
            candidate({
              appProperties: {
                ...candidate().appProperties,
                projectId: "33333333-3333-4333-8333-333333333333",
              },
            }),
          ],
        },
      ],
    });
    await expect(
      readDrivePhotosSyncBinding(readInput(), metadataAdapter),
    ).resolves.toEqual({ status: "invalid", reason: "metadata" });
    expect(metadataAdapter.readText).not.toHaveBeenCalled();

    const bodyAdapter = adapter({
      pages: [{ files: [candidate()] }],
      texts: ["not-json"],
    });
    await expect(
      readDrivePhotosSyncBinding(readInput(), bodyAdapter),
    ).resolves.toEqual({ status: "invalid", reason: "malformed" });
  });

  it("returns only a sanitized inaccessible status for raw Drive failures", async () => {
    const raw = "raw https://drive.example/files/project-root-file token-value";
    const result = await readDrivePhotosSyncBinding(
      readInput(),
      adapter({ listError: new Error(raw) }),
    );

    expect(result).toEqual({ status: "inaccessible" });
    expect(JSON.stringify(result)).not.toContain(raw);
    expect(JSON.stringify(result)).not.toContain(PROJECT_ROOT_ID);
    expect(JSON.stringify(result)).not.toContain("token-value");
  });
});

describe("Drive Google Photos sync binding create", () => {
  it("fresh-checks twice, creates once, and verifies the reread body", async () => {
    const value = binding();
    const drive = adapter({
      pages: [
        { files: [] },
        { files: [] },
        { files: [candidate()] },
      ],
      texts: [stringifyGooglePhotosSyncBinding(value)],
    });

    const result = await createDrivePhotosSyncBinding(
      { ...readInput(), binding: value },
      drive,
    );

    expect(result).toEqual({ status: "created", fileId: FILE_ID, binding: value });
    expect(drive.listCandidates).toHaveBeenCalledTimes(3);
    expect(drive.createJson).toHaveBeenCalledTimes(1);
    expect(drive.createJson).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "google-photos-sync.json",
        parentId: PROJECT_ROOT_ID,
        appProperties: buildDrivePhotosSyncBindingAppProperties({
          workspaceId: WORKSPACE_ID,
          projectId: PROJECT_ID,
        }),
      }),
    );
    expect(
      drive.listCandidates.mock.invocationCallOrder[1],
    ).toBeLessThan(drive.createJson.mock.invocationCallOrder[0]!);
  });

  it("refuses creation when a binding appears during the immediate recheck", async () => {
    const value = binding();
    const drive = adapter({
      pages: [{ files: [] }, { files: [candidate()] }],
      texts: [stringifyGooglePhotosSyncBinding(value)],
    });

    await expect(
      createDrivePhotosSyncBinding(
        { ...readInput(), binding: value },
        drive,
      ),
    ).resolves.toEqual({ status: "alreadyExists" });
    expect(drive.createJson).not.toHaveBeenCalled();
  });

  it("fails closed when the post-create reread is invalid", async () => {
    const value = binding();
    const drive = adapter({
      pages: [
        { files: [] },
        { files: [] },
        { files: [candidate()] },
      ],
      texts: ["{"],
    });

    await expect(
      createDrivePhotosSyncBinding(
        { ...readInput(), binding: value },
        drive,
      ),
    ).resolves.toEqual({ status: "validationFailed" });
  });

  it("does not write an invalid or foreign-owned binding", async () => {
    const value = binding();
    value.projectId = "33333333-3333-4333-8333-333333333333";
    const drive = adapter();

    await expect(
      createDrivePhotosSyncBinding(
        { ...readInput(), binding: value },
        drive,
      ),
    ).resolves.toEqual({ status: "validationFailed" });
    expect(drive.listCandidates).not.toHaveBeenCalled();
    expect(drive.createJson).not.toHaveBeenCalled();
  });
});

describe("Drive Google Photos sync binding best-effort update", () => {
  it("fresh-reads, checks generation, updates, and verifies the reread", async () => {
    const current = binding(2);
    const next = binding(3);
    const drive = adapter({
      pages: [{ files: [candidate()] }, { files: [candidate()] }],
      texts: [
        stringifyGooglePhotosSyncBinding(current),
        stringifyGooglePhotosSyncBinding(next),
      ],
    });

    const result = await updateDrivePhotosSyncBindingBestEffort(
      {
        ...readInput(),
        expectedStableGeneration: 2,
        binding: next,
      },
      drive,
    );

    expect(result).toEqual({ status: "updated", fileId: FILE_ID, binding: next });
    expect(drive.updateJson).toHaveBeenCalledTimes(1);
    expect(drive.updateJson).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: FILE_ID }),
    );
    expect(drive.readText).toHaveBeenCalledTimes(2);
  });

  it("reports staleGeneration without writing", async () => {
    const current = binding(3);
    const drive = adapter({
      pages: [{ files: [candidate()] }],
      texts: [stringifyGooglePhotosSyncBinding(current)],
    });

    await expect(
      updateDrivePhotosSyncBindingBestEffort(
        {
          ...readInput(),
          expectedStableGeneration: 2,
          binding: binding(4),
        },
        drive,
      ),
    ).resolves.toEqual({ status: "staleGeneration" });
    expect(drive.updateJson).not.toHaveBeenCalled();
  });

  it("rejects ownership mismatch before writing", async () => {
    const foreign = binding(2);
    foreign.workspaceId = "33333333-3333-4333-8333-333333333333";
    const drive = adapter();

    await expect(
      updateDrivePhotosSyncBindingBestEffort(
        {
          ...readInput(),
          expectedStableGeneration: 2,
          binding: foreign,
        },
        drive,
      ),
    ).resolves.toEqual({ status: "invalid" });
    expect(drive.listCandidates).not.toHaveBeenCalled();
    expect(drive.updateJson).not.toHaveBeenCalled();
  });

  it("fails closed when the post-update reread differs", async () => {
    const current = binding(2);
    const requested = binding(3);
    const unexpected = binding(4);
    const drive = adapter({
      pages: [{ files: [candidate()] }, { files: [candidate()] }],
      texts: [
        stringifyGooglePhotosSyncBinding(current),
        stringifyGooglePhotosSyncBinding(unexpected),
      ],
    });

    await expect(
      updateDrivePhotosSyncBindingBestEffort(
        {
          ...readInput(),
          expectedStableGeneration: 2,
          binding: requested,
        },
        drive,
      ),
    ).resolves.toEqual({ status: "invalid" });
  });

  it("returns sanitized status only when an update throws", async () => {
    const current = binding(2);
    const raw = "raw file binding-file project-root-file token-value";
    const drive = adapter({
      pages: [{ files: [candidate()] }],
      texts: [stringifyGooglePhotosSyncBinding(current)],
      updateError: new Error(raw),
    });
    const result = await updateDrivePhotosSyncBindingBestEffort(
      {
        ...readInput(),
        expectedStableGeneration: 2,
        binding: binding(3),
      },
      drive,
    );

    expect(result).toEqual({ status: "writeFailed" });
    expect(JSON.stringify(result)).not.toContain(raw);
    expect(JSON.stringify(result)).not.toContain(FILE_ID);
    expect(JSON.stringify(result)).not.toContain(PROJECT_ROOT_ID);
  });

  it("exposes no delete or repair operation", () => {
    const source = readFileSync(
      new URL("./drive-sync-binding.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("deleteDrivePhotosSyncBinding");
    expect(source).not.toContain("repairDrivePhotosSyncBinding");
    expect(source).not.toContain("DELETE");
  });
});
