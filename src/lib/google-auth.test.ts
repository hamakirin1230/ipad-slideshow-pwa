import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PHOTOS_LIBRARY_APPENDONLY_SCOPE,
  PHOTOS_LIBRARY_EDIT_APPCREATEDDATA_SCOPE,
  PHOTOS_LIBRARY_READONLY_APPCREATEDDATA_SCOPE,
  hasGrantedPhotosLibrarySyncScopes,
} from "./google-auth";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Google Photos Library sync grants", () => {
  it("asks GIS for exactly the three required Photos Library scopes", () => {
    const hasGrantedAllScopes = vi.fn(() => true);
    vi.stubGlobal("window", {
      google: { accounts: { oauth2: { hasGrantedAllScopes } } },
    });
    const tokenResponse = { scope: PHOTOS_LIBRARY_APPENDONLY_SCOPE };

    expect(hasGrantedPhotosLibrarySyncScopes(tokenResponse)).toBe(true);
    expect(hasGrantedAllScopes).toHaveBeenCalledWith(
      tokenResponse,
      PHOTOS_LIBRARY_APPENDONLY_SCOPE,
      PHOTOS_LIBRARY_EDIT_APPCREATEDDATA_SCOPE,
      PHOTOS_LIBRARY_READONLY_APPCREATEDDATA_SCOPE,
    );
  });

  it("fails closed when GIS cannot confirm every sync scope", () => {
    vi.stubGlobal("window", {});

    expect(hasGrantedPhotosLibrarySyncScopes({})).toBe(false);
  });
});
