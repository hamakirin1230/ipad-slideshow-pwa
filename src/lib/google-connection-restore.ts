export const GOOGLE_CONNECTION_RESTORE_STORAGE_KEY =
  "ipad-slideshow:google-connection-restore-v1";
export const GOOGLE_CONNECTION_RESTORE_WINDOW_MS = 60 * 60 * 1000;

export type GoogleConnectionRestoreMarker = {
  expiresAt: number;
};

export type GoogleConnectionRestoreStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const ALLOWED_MARKER_KEYS = new Set(["expiresAt", "schemaVersion"]);

export function createGoogleConnectionRestoreExpiry(
  nowMs: number,
  expiresInSeconds?: number,
) {
  let windowMs = GOOGLE_CONNECTION_RESTORE_WINDOW_MS;
  if (
    typeof expiresInSeconds === "number" &&
    Number.isFinite(expiresInSeconds) &&
    expiresInSeconds > 0
  ) {
    const tokenLifetimeMs = Math.floor(expiresInSeconds * 1000);
    if (tokenLifetimeMs < windowMs) {
      windowMs = tokenLifetimeMs;
    }
  }
  return nowMs + windowMs;
}

export function parseGoogleConnectionRestoreMarker(
  raw: string,
): GoogleConnectionRestoreMarker | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0 || keys.some((key) => !ALLOWED_MARKER_KEYS.has(key))) {
    return null;
  }

  const expiresAt = record.expiresAt;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    return null;
  }

  if (
    record.schemaVersion !== undefined &&
    (typeof record.schemaVersion !== "number" ||
      !Number.isFinite(record.schemaVersion))
  ) {
    return null;
  }

  return { expiresAt };
}

export function isGoogleConnectionRestoreMarkerActive(
  marker: GoogleConnectionRestoreMarker | null,
  nowMs: number,
): marker is GoogleConnectionRestoreMarker {
  return marker !== null && marker.expiresAt > nowMs;
}

export function readActiveGoogleConnectionRestoreMarker(
  nowMs: number,
  storage: GoogleConnectionRestoreStorage | null = getBrowserLocalStorage(),
): GoogleConnectionRestoreMarker | null {
  if (!storage) {
    return null;
  }

  let raw: string | null;
  try {
    raw = storage.getItem(GOOGLE_CONNECTION_RESTORE_STORAGE_KEY);
  } catch {
    return null;
  }

  if (raw === null) {
    return null;
  }

  const marker = parseGoogleConnectionRestoreMarker(raw);
  if (!isGoogleConnectionRestoreMarkerActive(marker, nowMs)) {
    clearGoogleConnectionRestoreMarker(storage);
    return null;
  }

  return marker;
}

export function writeGoogleConnectionRestoreMarker(
  expiresAt: number,
  storage: GoogleConnectionRestoreStorage | null = getBrowserLocalStorage(),
) {
  if (!storage || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    return;
  }

  try {
    storage.setItem(
      GOOGLE_CONNECTION_RESTORE_STORAGE_KEY,
      JSON.stringify({ expiresAt }),
    );
  } catch {
    // Ignore quota / private-mode failures. Token restore stays best-effort.
  }
}

export function clearGoogleConnectionRestoreMarker(
  storage: GoogleConnectionRestoreStorage | null = getBrowserLocalStorage(),
) {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(GOOGLE_CONNECTION_RESTORE_STORAGE_KEY);
  } catch {
    // Ignore storage failures during cleanup.
  }
}

function getBrowserLocalStorage(): GoogleConnectionRestoreStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}
