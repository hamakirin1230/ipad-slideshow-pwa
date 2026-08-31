import { describe, expect, it } from "vitest";
import {
  DRIVE_FILE_SCOPE,
  PHOTOS_LIBRARY_APPENDONLY_SCOPE,
  PHOTOS_LIBRARY_EDIT_APPCREATEDDATA_SCOPE,
  PHOTOS_LIBRARY_READONLY_APPCREATEDDATA_SCOPE,
  PHOTOS_LIBRARY_SYNC_SCOPES,
  PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE,
} from "../google-auth";
import {
  GOOGLE_PHOTOS_EXPORT_SCOPE,
  GOOGLE_PHOTOS_SYNC_SCOPES,
  isPhotosExportScopeRequest,
  isPhotosLibrarySyncScopeRequest,
  tokenResponseGrantsPhotosLibraryAppendonly,
  tokenResponseGrantsPhotosLibrarySync,
  tokenScopeList,
} from "./authorization";

describe("google photos export authorization", () => {
  it("requests only the Photos Library appendonly scope", () => {
    expect(GOOGLE_PHOTOS_EXPORT_SCOPE).toBe(
      "https://www.googleapis.com/auth/photoslibrary.appendonly",
    );
    expect(isPhotosExportScopeRequest(GOOGLE_PHOTOS_EXPORT_SCOPE)).toBe(true);
    expect(
      isPhotosExportScopeRequest(
        `${DRIVE_FILE_SCOPE} ${GOOGLE_PHOTOS_EXPORT_SCOPE}`,
      ),
    ).toBe(false);
    expect(
      isPhotosExportScopeRequest(
        "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
      ),
    ).toBe(false);
    expect(tokenScopeList(GOOGLE_PHOTOS_EXPORT_SCOPE)).toEqual([
      "https://www.googleapis.com/auth/photoslibrary.appendonly",
    ]);
    expect(
      isPhotosExportScopeRequest(
        `${GOOGLE_PHOTOS_EXPORT_SCOPE} ${PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE}`,
      ),
    ).toBe(false);
  });

  it("treats a granted appendonly scope as sufficient without Drive identity scopes", () => {
    expect(
      tokenResponseGrantsPhotosLibraryAppendonly({
        scope: GOOGLE_PHOTOS_EXPORT_SCOPE,
      }),
    ).toBe(true);
    expect(
      tokenResponseGrantsPhotosLibraryAppendonly({
        scope: DRIVE_FILE_SCOPE,
      }),
    ).toBe(false);
    expect(tokenScopeList(`${DRIVE_FILE_SCOPE} ${GOOGLE_PHOTOS_EXPORT_SCOPE}`)).toEqual(
      [DRIVE_FILE_SCOPE, GOOGLE_PHOTOS_EXPORT_SCOPE],
    );
  });

  it("defines an exact three-scope contract for future same-album sync", () => {
    const expected = [
      PHOTOS_LIBRARY_APPENDONLY_SCOPE,
      PHOTOS_LIBRARY_EDIT_APPCREATEDDATA_SCOPE,
      PHOTOS_LIBRARY_READONLY_APPCREATEDDATA_SCOPE,
    ];

    expect(GOOGLE_PHOTOS_SYNC_SCOPES).toBe(PHOTOS_LIBRARY_SYNC_SCOPES);
    expect(tokenScopeList(GOOGLE_PHOTOS_SYNC_SCOPES)).toEqual(expected);
    expect(new Set(tokenScopeList(GOOGLE_PHOTOS_SYNC_SCOPES)).size).toBe(3);
    expect(isPhotosLibrarySyncScopeRequest(GOOGLE_PHOTOS_SYNC_SCOPES)).toBe(
      true,
    );
    expect(
      isPhotosLibrarySyncScopeRequest([...expected].reverse().join(" ")),
    ).toBe(true);
  });

  it("rejects Drive, Picker, missing, duplicate, and unrelated sync scopes", () => {
    const exactScopes = tokenScopeList(GOOGLE_PHOTOS_SYNC_SCOPES);

    expect(
      isPhotosLibrarySyncScopeRequest(
        `${GOOGLE_PHOTOS_SYNC_SCOPES} ${DRIVE_FILE_SCOPE}`,
      ),
    ).toBe(false);
    expect(
      isPhotosLibrarySyncScopeRequest(
        `${GOOGLE_PHOTOS_SYNC_SCOPES} ${PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE}`,
      ),
    ).toBe(false);
    expect(
      isPhotosLibrarySyncScopeRequest(exactScopes.slice(0, 2).join(" ")),
    ).toBe(false);
    expect(
      isPhotosLibrarySyncScopeRequest(
        `${GOOGLE_PHOTOS_SYNC_SCOPES} ${PHOTOS_LIBRARY_APPENDONLY_SCOPE}`,
      ),
    ).toBe(false);
    expect(
      isPhotosLibrarySyncScopeRequest(
        exactScopes
          .map((scope, index) => (index === 2 ? "scope:unrelated" : scope))
          .join(" "),
      ),
    ).toBe(false);
  });

  it("accepts sync token responses containing every required scope", () => {
    const required = tokenScopeList(GOOGLE_PHOTOS_SYNC_SCOPES);

    expect(
      tokenResponseGrantsPhotosLibrarySync({
        scope: GOOGLE_PHOTOS_SYNC_SCOPES,
      }),
    ).toBe(true);
    expect(
      tokenResponseGrantsPhotosLibrarySync({
        scope: [...required].reverse().join(" "),
      }),
    ).toBe(true);
    expect(
      tokenResponseGrantsPhotosLibrarySync({
        scope: `${DRIVE_FILE_SCOPE} ${GOOGLE_PHOTOS_SYNC_SCOPES}`,
      }),
    ).toBe(true);
  });

  it("rejects sync token responses missing any required scope", () => {
    const required = tokenScopeList(GOOGLE_PHOTOS_SYNC_SCOPES);

    for (const missingScope of required) {
      expect(
        tokenResponseGrantsPhotosLibrarySync({
          scope: required
            .filter((scope) => scope !== missingScope)
            .join(" "),
        }),
      ).toBe(false);
    }
    expect(tokenResponseGrantsPhotosLibrarySync({ scope: DRIVE_FILE_SCOPE })).toBe(
      false,
    );
    expect(
      tokenResponseGrantsPhotosLibrarySync({
        scope: PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE,
      }),
    ).toBe(false);
    expect(
      tokenResponseGrantsPhotosLibrarySync({
        scope: PHOTOS_LIBRARY_APPENDONLY_SCOPE,
      }),
    ).toBe(false);
  });

  it("keeps the active export authorization appendonly-only", () => {
    expect(GOOGLE_PHOTOS_EXPORT_SCOPE).toBe(PHOTOS_LIBRARY_APPENDONLY_SCOPE);
    expect(isPhotosExportScopeRequest(GOOGLE_PHOTOS_EXPORT_SCOPE)).toBe(true);
    expect(isPhotosExportScopeRequest(GOOGLE_PHOTOS_SYNC_SCOPES)).toBe(false);
  });
});
