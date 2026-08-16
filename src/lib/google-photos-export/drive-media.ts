import type { GooglePhotosExportMimeType } from "./contract";

const DRIVE_API_FILES_URL = "https://www.googleapis.com/drive/v3/files";

export async function openDriveProjectAssetStream(input: {
  accessToken: string;
  assetFileId: string;
  expectedMimeType: GooglePhotosExportMimeType;
  startByte?: number;
  signal: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const params = new URLSearchParams({ alt: "media" });
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
  };
  if (input.startByte && input.startByte > 0) {
    headers.Range = `bytes=${input.startByte}-`;
  }

  const response = await fetch(
    `${DRIVE_API_FILES_URL}/${encodeURIComponent(input.assetFileId)}?${params.toString()}`,
    {
      method: "GET",
      headers,
      cache: "no-store",
      credentials: "omit",
      signal: input.signal,
    },
  );

  if (!response.ok && response.status !== 206) {
    throw new Error("drive-asset-stream-failed");
  }

  if (!response.body) {
    throw new Error("drive-asset-stream-missing");
  }

  return response.body;
}
