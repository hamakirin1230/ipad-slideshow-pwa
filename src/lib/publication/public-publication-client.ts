"use client";

import { md5 } from "@noble/hashes/legacy.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { upload } from "@vercel/blob/client";
import type { ProjectPublishRevision } from "../publish-history/project-publish-revision";
import type { PreparedPublicAsset } from "./public-publication-contract";
import { toPublicPublicationRevisionInput } from "./public-publication-request";

const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files";

export type PublicPublicationClientResult =
  | { ok: true; sharePath: string }
  | { ok: false; code: "preparationFailed" | "activationFailed" };

export async function preparePublicPublicationArtifact(input: {
  accessToken: string;
  manifestFileId: string;
  revision: ProjectPublishRevision;
  signal: AbortSignal;
}): Promise<PublicPublicationClientResult> {
  const revision = toPublicPublicationRevisionInput(input.revision);
  if (!revision) return { ok: false, code: "preparationFailed" };

  try {
    const planResponse = await fetch("/api/publication/prepare", {
      method: "POST",
      headers: publicationHeaders(input.accessToken),
      body: JSON.stringify({
        manifestFileId: input.manifestFileId,
        revision: input.revision,
      }),
      cache: "no-store",
      credentials: "same-origin",
      signal: input.signal,
    });
    if (!planResponse.ok) return { ok: false, code: "preparationFailed" };
    const assets = parsePreparedAssets(await planResponse.json());
    if (!assets || assets.length !== revision.assets.length) {
      return { ok: false, code: "preparationFailed" };
    }

    for (const asset of assets) {
      if (asset.url) continue;
      const driveResponse = await fetch(
        `${DRIVE_FILES_API}/${encodeURIComponent(asset.driveFileId)}?alt=media`,
        {
          headers: { Authorization: `Bearer ${input.accessToken}` },
          cache: "no-store",
          credentials: "omit",
          signal: input.signal,
        },
      );
      if (
        !driveResponse.ok ||
        !driveResponse.body ||
        !asset.checksum ||
        !driveResponseMatchesAsset(driveResponse, asset)
      ) {
        return { ok: false, code: "preparationFailed" };
      }
      const hasher = md5.create();
      const verifiedStream = driveResponse.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            hasher.update(chunk);
            controller.enqueue(chunk);
          },
        }),
      );
      const uploaded = await upload(asset.pathname, verifiedStream, {
        access: "public",
        handleUploadUrl: "/api/publication/upload",
        headers: { Authorization: `Bearer ${input.accessToken}` },
        clientPayload: JSON.stringify({
          manifestFileId: input.manifestFileId,
          projectId: revision.projectId,
          revisionId: revision.revisionId,
          asset: {
            assetId: asset.assetId,
            driveFileId: asset.driveFileId,
            mimeType: asset.mimeType,
            sizeBytes: asset.sizeBytes,
            modifiedTime: asset.modifiedTime,
            checksum: asset.checksum,
          },
        }),
        contentType: asset.mimeType,
        multipart: true,
        abortSignal: input.signal,
      });
      if (bytesToHex(hasher.digest()) !== asset.checksum.toLowerCase()) {
        return { ok: false, code: "preparationFailed" };
      }
      asset.url = uploaded.url;
    }

    const finalizeResponse = await fetch("/api/publication/finalize", {
      method: "POST",
      headers: publicationHeaders(input.accessToken),
      body: JSON.stringify({
        manifestFileId: input.manifestFileId,
        revision: input.revision,
        assets,
      }),
      cache: "no-store",
      credentials: "same-origin",
      signal: input.signal,
    });
    if (!finalizeResponse.ok) {
      return { ok: false, code: "preparationFailed" };
    }
    const sharePath = readSharePath(await finalizeResponse.json());
    return sharePath
      ? { ok: true, sharePath }
      : { ok: false, code: "preparationFailed" };
  } catch {
    return { ok: false, code: "preparationFailed" };
  }
}

export async function activatePreparedPublicPublication(input: {
  accessToken: string;
  manifestFileId: string;
  projectId: string;
  revisionId?: string;
  signal: AbortSignal;
}): Promise<PublicPublicationClientResult> {
  try {
    const response = await fetch("/api/publication/activate", {
      method: "POST",
      headers: publicationHeaders(input.accessToken),
      body: JSON.stringify({
        manifestFileId: input.manifestFileId,
        projectId: input.projectId,
        ...(input.revisionId ? { revisionId: input.revisionId } : {}),
      }),
      cache: "no-store",
      credentials: "same-origin",
      signal: input.signal,
    });
    if (!response.ok) return { ok: false, code: "activationFailed" };
    const sharePath = readSharePath(await response.json());
    return sharePath
      ? { ok: true, sharePath }
      : { ok: false, code: "activationFailed" };
  } catch {
    return { ok: false, code: "activationFailed" };
  }
}

export function toAbsolutePublicShareUrl(sharePath: string) {
  if (
    typeof window === "undefined" ||
    !/^\/share\/[A-Za-z0-9_-]{43}$/.test(sharePath)
  ) {
    return null;
  }
  return new URL(sharePath, window.location.origin).toString();
}

function publicationHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function driveResponseMatchesAsset(
  response: Response,
  asset: PreparedPublicAsset,
) {
  const contentType =
    response.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() ??
    "";
  const contentLength = response.headers.get("Content-Length");
  return (
    contentType === asset.mimeType &&
    (contentLength === null || Number(contentLength) === asset.sizeBytes)
  );
}

function parsePreparedAssets(value: unknown): PreparedPublicAsset[] | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("assets" in value) ||
    !Array.isArray(value.assets)
  ) {
    return null;
  }
  const assets: PreparedPublicAsset[] = [];
  for (const item of value.assets) {
    if (
      !isRecord(item) ||
      typeof item.assetId !== "string" ||
      typeof item.driveFileId !== "string" ||
      typeof item.mimeType !== "string" ||
      typeof item.sizeBytes !== "number" ||
      typeof item.modifiedTime !== "string" ||
      (item.checksum !== null && typeof item.checksum !== "string") ||
      typeof item.pathname !== "string" ||
      (item.url !== null && typeof item.url !== "string")
    ) {
      return null;
    }
    assets.push(item as PreparedPublicAsset);
  }
  return assets;
}

function readSharePath(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("sharePath" in value) ||
    typeof value.sharePath !== "string" ||
    !/^\/share\/[A-Za-z0-9_-]{43}$/.test(value.sharePath)
  ) {
    return null;
  }
  return value.sharePath;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
