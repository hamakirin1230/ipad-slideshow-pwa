import {
  PHOTOS_LIBRARY_APPENDONLY_SCOPE,
  PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE,
  type GoogleTokenResponse,
  hasGrantedPhotosLibraryAppendonlyScope,
} from "../google-auth";

export const GOOGLE_PHOTOS_EXPORT_SCOPE = PHOTOS_LIBRARY_APPENDONLY_SCOPE;

export function isPhotosLibraryAppendonlyScope(value: string) {
  return value === GOOGLE_PHOTOS_EXPORT_SCOPE;
}

export function tokenResponseGrantsPhotosLibraryAppendonly(
  tokenResponse: GoogleTokenResponse,
) {
  if (
    tokenScopeList(tokenResponse.scope).includes(GOOGLE_PHOTOS_EXPORT_SCOPE)
  ) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  return hasGrantedPhotosLibraryAppendonlyScope(tokenResponse);
}

export function tokenScopeList(scope: string | undefined) {
  return (scope ?? "").split(/\s+/).filter((value) => value.length > 0);
}

export function isPhotosExportScopeRequest(scope: string) {
  const scopes = tokenScopeList(scope);
  return (
    scopes.length === 1 &&
    scopes[0] === GOOGLE_PHOTOS_EXPORT_SCOPE &&
    !scopes.includes(PHOTOS_PICKER_MEDIA_ITEMS_READONLY_SCOPE)
  );
}
