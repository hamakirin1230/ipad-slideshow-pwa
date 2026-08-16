import { describe, expect, it } from "vitest";
import { DRIVE_FILE_SCOPE } from "../google-auth";
import {
  GOOGLE_PHOTOS_EXPORT_SCOPE,
  isPhotosExportScopeRequest,
  tokenResponseGrantsPhotosLibraryAppendonly,
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
});
