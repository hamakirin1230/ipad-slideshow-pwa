import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  batchAddGooglePhotosSyncMediaItems,
  batchRemoveGooglePhotosSyncMediaItems,
  chunkGooglePhotosMediaItemIds,
  getGooglePhotosSyncAlbum,
  listGooglePhotosSyncAlbumsPage,
  searchGooglePhotosSyncAlbumMediaItemsPage,
  updateGooglePhotosAlbumMembershipSerially,
  updateGooglePhotosSyncAlbumTitle,
  type GooglePhotosSyncLibraryAdapter,
} from "./sync-library-api";

const ACCESS_TOKEN = "test-access-token";
const ALBUM_ID = "album/with special";

function signal() {
  return new AbortController().signal;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(response: Response | (() => Promise<Response>)) {
  const fetchMock = vi.fn(
    typeof response === "function"
      ? response
      : async () => response,
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function safeAlbum() {
  return {
    id: "album-id",
    title: "作品",
    isWriteable: true,
    mediaItemsCount: "12",
    productUrl: "https://photos.google.com/unsafe",
    coverPhotoBaseUrl: "https://images.example/unsafe",
    coverPhotoMediaItemId: "cover-id",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Google Photos sync albums.get", () => {
  it("uses an encoded URL and bearer request while returning only safe fields", async () => {
    const fetchMock = mockFetch(jsonResponse(safeAlbum()));

    const result = await getGooglePhotosSyncAlbum({
      accessToken: ACCESS_TOKEN,
      albumId: ALBUM_ID,
      signal: signal(),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://photoslibrary.googleapis.com/v1/albums/album%2Fwith%20special",
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        credentials: "omit",
      }),
    );
    expect(result).toEqual({
      status: "ready",
      album: {
        id: "album-id",
        title: "作品",
        isWriteable: true,
        mediaItemsCount: "12",
      },
    });
    expect(result).not.toHaveProperty("album.productUrl");
    expect(result).not.toHaveProperty("album.coverPhotoBaseUrl");
  });

  it("classifies 404 separately and rejects malformed responses", async () => {
    mockFetch(jsonResponse({ error: "raw" }, 404));
    await expect(
      getGooglePhotosSyncAlbum({
        accessToken: ACCESS_TOKEN,
        albumId: "missing",
        signal: signal(),
      }),
    ).resolves.toEqual({ status: "notFound" });

    mockFetch(jsonResponse({ ...safeAlbum(), mediaItemsCount: 12 }));
    await expect(
      getGooglePhotosSyncAlbum({
        accessToken: ACCESS_TOKEN,
        albumId: "album-id",
        signal: signal(),
      }),
    ).resolves.toEqual({ status: "invalidResponse" });
  });

  it("does not leak raw network failures and propagates AbortError", async () => {
    const raw = "raw token URL and album identifier";
    mockFetch(async () => {
      throw new Error(raw);
    });
    const failed = await getGooglePhotosSyncAlbum({
      accessToken: ACCESS_TOKEN,
      albumId: "album-id",
      signal: signal(),
    });
    expect(failed).toEqual({ status: "inaccessible" });
    expect(JSON.stringify(failed)).not.toContain(raw);

    mockFetch(async () => {
      throw new DOMException("raw abort detail", "AbortError");
    });
    await expect(
      getGooglePhotosSyncAlbum({
        accessToken: ACCESS_TOKEN,
        albumId: "album-id",
        signal: signal(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("Google Photos sync albums.list", () => {
  it("uses app-created-only pagination with a maximum page size", async () => {
    const fetchMock = mockFetch(
      jsonResponse({ albums: [safeAlbum()], nextPageToken: "next token" }),
    );

    const result = await listGooglePhotosSyncAlbumsPage({
      accessToken: ACCESS_TOKEN,
      pageSize: 50,
      pageToken: "page token/+",
      signal: signal(),
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    const parsedUrl = new URL(String(url));
    expect(parsedUrl.pathname).toBe("/v1/albums");
    expect(parsedUrl.searchParams.get("excludeNonAppCreatedData")).toBe("true");
    expect(parsedUrl.searchParams.get("pageSize")).toBe("50");
    expect(parsedUrl.searchParams.get("pageToken")).toBe("page token/+");
    expect(init).not.toHaveProperty("body");
    expect(result).toEqual({
      status: "ready",
      albums: [
        {
          id: "album-id",
          title: "作品",
          isWriteable: true,
          mediaItemsCount: "12",
        },
      ],
      nextPageToken: "next token",
    });
    expect(JSON.stringify(result)).not.toContain("productUrl");
    expect(JSON.stringify(result)).not.toContain("coverPhotoBaseUrl");
  });

  it("accepts an omitted albums array as empty and fails closed otherwise", async () => {
    mockFetch(jsonResponse({}));
    await expect(
      listGooglePhotosSyncAlbumsPage({
        accessToken: ACCESS_TOKEN,
        signal: signal(),
      }),
    ).resolves.toEqual({ status: "ready", albums: [], nextPageToken: null });

    mockFetch(jsonResponse({ albums: [{ title: "missing id" }] }));
    await expect(
      listGooglePhotosSyncAlbumsPage({
        accessToken: ACCESS_TOKEN,
        signal: signal(),
      }),
    ).resolves.toEqual({ status: "invalidResponse" });

    mockFetch(jsonResponse({ albums: [], nextPageToken: "" }));
    await expect(
      listGooglePhotosSyncAlbumsPage({
        accessToken: ACCESS_TOKEN,
        signal: signal(),
      }),
    ).resolves.toEqual({ status: "invalidResponse" });
  });

  it("rejects invalid page sizes before fetch", async () => {
    const fetchMock = mockFetch(jsonResponse({}));
    await expect(
      listGooglePhotosSyncAlbumsPage({
        accessToken: ACCESS_TOKEN,
        pageSize: 51,
        signal: signal(),
      }),
    ).resolves.toEqual({ status: "invalidInput" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Google Photos sync mediaItems.search", () => {
  it("searches one album without filters and parses only ordered IDs", async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        mediaItems: [
          { id: "media-1", filename: "secret.jpg", baseUrl: "unsafe" },
          { id: "media-2", description: "private" },
        ],
        nextPageToken: "next-page",
      }),
    );

    const result = await searchGooglePhotosSyncAlbumMediaItemsPage({
      accessToken: ACCESS_TOKEN,
      albumId: "album-id",
      pageSize: 100,
      pageToken: "current-page",
      signal: signal(),
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://photoslibrary.googleapis.com/v1/mediaItems:search");
    expect(JSON.parse(String(init?.body))).toEqual({
      albumId: "album-id",
      pageSize: 100,
      pageToken: "current-page",
    });
    expect(String(init?.body)).not.toContain("filters");
    expect(result).toEqual({
      status: "ready",
      mediaItemIds: ["media-1", "media-2"],
      nextPageToken: "next-page",
    });
    expect(JSON.stringify(result)).not.toContain("filename");
    expect(JSON.stringify(result)).not.toContain("baseUrl");
  });

  it("accepts omitted mediaItems as empty and rejects malformed or duplicate IDs", async () => {
    mockFetch(jsonResponse({}));
    await expect(
      searchGooglePhotosSyncAlbumMediaItemsPage({
        accessToken: ACCESS_TOKEN,
        albumId: "album-id",
        signal: signal(),
      }),
    ).resolves.toEqual({
      status: "ready",
      mediaItemIds: [],
      nextPageToken: null,
    });

    for (const mediaItems of [
      [{}],
      [{ id: "media-1" }, { id: "media-1" }],
    ]) {
      mockFetch(jsonResponse({ mediaItems }));
      await expect(
        searchGooglePhotosSyncAlbumMediaItemsPage({
          accessToken: ACCESS_TOKEN,
          albumId: "album-id",
          signal: signal(),
        }),
      ).resolves.toEqual({ status: "invalidResponse" });
    }
  });

  it("rejects page sizes over 100 and propagates AbortError", async () => {
    const fetchMock = mockFetch(jsonResponse({}));
    await expect(
      searchGooglePhotosSyncAlbumMediaItemsPage({
        accessToken: ACCESS_TOKEN,
        albumId: "album-id",
        pageSize: 101,
        signal: signal(),
      }),
    ).resolves.toEqual({ status: "invalidInput" });
    expect(fetchMock).not.toHaveBeenCalled();

    mockFetch(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    await expect(
      searchGooglePhotosSyncAlbumMediaItemsPage({
        accessToken: ACCESS_TOKEN,
        albumId: "album-id",
        signal: signal(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("Google Photos sync albums.patch", () => {
  it("updates only the title with its exact update mask", async () => {
    const fetchMock = mockFetch(jsonResponse({ ...safeAlbum(), title: "更新後" }));
    const result = await updateGooglePhotosSyncAlbumTitle({
      accessToken: ACCESS_TOKEN,
      albumId: ALBUM_ID,
      title: "更新後",
      signal: signal(),
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://photoslibrary.googleapis.com/v1/albums/album%2Fwith%20special?updateMask=title",
    );
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ title: "更新後" });
    expect(String(init?.body)).not.toContain("coverPhoto");
    expect(result).toMatchObject({ status: "updated" });
  });

  it("rejects empty, untrimmed, or over-500-character titles before fetch", async () => {
    const fetchMock = mockFetch(jsonResponse(safeAlbum()));
    for (const title of ["", " title ", "x".repeat(501)]) {
      await expect(
        updateGooglePhotosSyncAlbumTitle({
          accessToken: ACCESS_TOKEN,
          albumId: "album-id",
          title,
          signal: signal(),
        }),
      ).resolves.toEqual({ status: "invalidInput" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Google Photos sync membership batches", () => {
  it("uses POST for direct add/remove and never DELETE", async () => {
    const fetchMock = mockFetch(jsonResponse({}));
    await expect(
      batchAddGooglePhotosSyncMediaItems({
        accessToken: ACCESS_TOKEN,
        albumId: ALBUM_ID,
        mediaItemIds: ["media-1", "media-2"],
        signal: signal(),
      }),
    ).resolves.toEqual({ status: "completed" });
    await expect(
      batchRemoveGooglePhotosSyncMediaItems({
        accessToken: ACCESS_TOKEN,
        albumId: ALBUM_ID,
        mediaItemIds: ["media-1"],
        signal: signal(),
      }),
    ).resolves.toEqual({ status: "completed" });

    expect(fetchMock.mock.calls[0]![0]).toContain(":batchAddMediaItems");
    expect(fetchMock.mock.calls[1]![0]).toContain(":batchRemoveMediaItems");
    expect(fetchMock.mock.calls[0]![1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[1]![1]?.method).toBe("POST");
    expect(fetchMock.mock.calls.flat().join(" ")).not.toContain("DELETE");
  });

  it("rejects empty, duplicate, or over-50 direct requests without fetch", async () => {
    const fetchMock = mockFetch(jsonResponse({}));
    for (const mediaItemIds of [
      [],
      ["media-1", "media-1"],
      Array.from({ length: 51 }, (_, index) => `media-${index}`),
    ]) {
      await expect(
        batchRemoveGooglePhotosSyncMediaItems({
          accessToken: ACCESS_TOKEN,
          albumId: "album-id",
          mediaItemIds,
          signal: signal(),
        }),
      ).resolves.toEqual({ status: "invalidInput" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a safe failure for non-2xx without parsing raw content", async () => {
    mockFetch(jsonResponse({ error: "raw URL token and identifiers" }, 500));
    const result = await batchRemoveGooglePhotosSyncMediaItems({
      accessToken: ACCESS_TOKEN,
      albumId: "album-id",
      mediaItemIds: ["media-1"],
      signal: signal(),
    });
    expect(result).toEqual({ status: "failed" });
    expect(JSON.stringify(result)).not.toContain("raw");
    expect(JSON.stringify(result)).not.toContain("media-1");
  });
});

describe("Google Photos sync membership chunking", () => {
  it.each([1, 50, 51, 100, 101])(
    "preserves order and chunks %i IDs at 50",
    (count) => {
      const ids = Array.from({ length: count }, (_, index) => `media-${index}`);
      const result = chunkGooglePhotosMediaItemIds(ids);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.chunks.every((chunk) => chunk.length <= 50)).toBe(true);
      expect(result.chunks.flat()).toEqual(ids);
      expect(result.chunks).toHaveLength(Math.ceil(count / 50));
    },
  );

  it("rejects duplicate IDs and treats empty input as an explicit no-op", () => {
    expect(chunkGooglePhotosMediaItemIds(["same", "same"])).toEqual({ ok: false });
    expect(chunkGooglePhotosMediaItemIds([])).toEqual({ ok: true, chunks: [] });
  });

  it("executes chunks serially, preserves order, and does not retry", async () => {
    const callOrder: string[][] = [];
    let inFlight = 0;
    let maximumInFlight = 0;
    const batchAddMediaItems = vi.fn(async (input) => {
      inFlight += 1;
      maximumInFlight = Math.max(maximumInFlight, inFlight);
      await Promise.resolve();
      callOrder.push(input.mediaItemIds);
      inFlight -= 1;
      return { status: "completed" as const };
    });
    const adapter = {
      batchAddMediaItems,
      batchRemoveMediaItems: vi.fn(),
    } as Pick<
      GooglePhotosSyncLibraryAdapter,
      "batchAddMediaItems" | "batchRemoveMediaItems"
    >;
    const ids = Array.from({ length: 101 }, (_, index) => `media-${index}`);

    await expect(
      updateGooglePhotosAlbumMembershipSerially(
        {
          operation: "add",
          accessToken: ACCESS_TOKEN,
          albumId: "album-id",
          mediaItemIds: ids,
          signal: signal(),
        },
        adapter,
      ),
    ).resolves.toEqual({ status: "completed", completedCount: 101 });
    expect(maximumInFlight).toBe(1);
    expect(callOrder.flat()).toEqual(ids);
    expect(batchAddMediaItems).toHaveBeenCalledTimes(3);
  });

  it("stops after the first failed chunk and reports only a safe count", async () => {
    const batchRemoveMediaItems = vi
      .fn()
      .mockResolvedValueOnce({ status: "completed" })
      .mockResolvedValueOnce({ status: "failed" });
    const adapter = {
      batchAddMediaItems: vi.fn(),
      batchRemoveMediaItems,
    } as Pick<
      GooglePhotosSyncLibraryAdapter,
      "batchAddMediaItems" | "batchRemoveMediaItems"
    >;
    const ids = Array.from({ length: 101 }, (_, index) => `media-${index}`);

    await expect(
      updateGooglePhotosAlbumMembershipSerially(
        {
          operation: "remove",
          accessToken: ACCESS_TOKEN,
          albumId: "album-id",
          mediaItemIds: ids,
          signal: signal(),
        },
        adapter,
      ),
    ).resolves.toEqual({ status: "failed", completedCount: 50 });
    expect(batchRemoveMediaItems).toHaveBeenCalledTimes(2);
  });
});

describe("Google Photos sync library security contract", () => {
  it("does not add persistence, logging, retries, or public raw errors", () => {
    const source = readFileSync(
      new URL("./sync-library-api.ts", import.meta.url),
      "utf8",
    );
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "document.cookie",
      "console.log",
      "console.error",
      "console.warn",
      "setTimeout",
      "productUrl",
      "coverPhotoBaseUrl",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
