import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DriveApiError,
  DriveProjectDeleteRequestError,
  readDriveProjectRootMetadataForDeletion,
  writeDriveProjectIndexForDeletion,
} from "./google-drive";

const ACCESS_TOKEN = "access-token-index-write-fixture";
const INDEX_FILE_ID = "index-file-id-fixture";
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_FOLDER_ID = "project-folder-id-fixture";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("writeDriveProjectIndexForDeletion", () => {
  it("writes index via multipart PATCH and never DELETE", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: INDEX_FILE_ID,
            name: "index.json",
            mimeType: "application/json",
            appProperties: {
              app: "ipad-slideshow-pwa",
              role: "index",
              schemaVersion: "1",
              workspaceId: WORKSPACE_ID,
            },
            size: "12",
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchImpl);

    await writeDriveProjectIndexForDeletion({
      accessToken: ACCESS_TOKEN,
      indexJsonFileId: INDEX_FILE_ID,
      workspaceId: WORKSPACE_ID,
      jsonText: "{}\n",
      signal: new AbortController().signal,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/upload/drive/v3/files/");
    expect(init.method).toBe("PATCH");
    expect(init.method).not.toBe("DELETE");
    expect(String(init.body)).not.toContain('"trashed":true');
    expect(String(init.body)).toContain('"role":"index"');
    expect(String(init.body)).toContain(WORKSPACE_ID);
  });

  it("keeps DriveApiError for 401 and uses a sanitized error for other failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    await expect(
      writeDriveProjectIndexForDeletion({
        accessToken: ACCESS_TOKEN,
        indexJsonFileId: INDEX_FILE_ID,
        workspaceId: WORKSPACE_ID,
        jsonText: "{}\n",
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(DriveApiError);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    await expect(
      writeDriveProjectIndexForDeletion({
        accessToken: ACCESS_TOKEN,
        indexJsonFileId: INDEX_FILE_ID,
        workspaceId: WORKSPACE_ID,
        jsonText: "{}\n",
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(DriveProjectDeleteRequestError);
  });
});

describe("readDriveProjectRootMetadataForDeletion", () => {
  it("reads metadata with GET and does not DELETE", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: PROJECT_FOLDER_ID,
            name: "name",
            mimeType: "application/vnd.google-apps.folder",
            appProperties: {},
            trashed: true,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const file = await readDriveProjectRootMetadataForDeletion({
      accessToken: ACCESS_TOKEN,
      projectFolderId: PROJECT_FOLDER_ID,
      signal: new AbortController().signal,
    });

    expect(file.id).toBe(PROJECT_FOLDER_ID);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const init = fetchImpl.mock.calls[0][1] as RequestInit | undefined;
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.method).not.toBe("DELETE");
  });
});
