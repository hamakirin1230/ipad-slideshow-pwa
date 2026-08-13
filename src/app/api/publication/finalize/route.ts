import { NextResponse } from "next/server";
import { finalizePublicRevisionArtifact } from "@/lib/publication/public-publication-blob-server";
import type { PreparedPublicAsset } from "@/lib/publication/public-publication-contract";
import {
  readBearerAccessToken,
  verifyDriveAssetAccess,
  verifyDriveProjectManifestAccess,
} from "@/lib/publication/public-publication-drive-server";
import { requirePublicShareSecret } from "@/lib/publication/public-publication-identity";
import { parsePublicPublicationInternalRequest } from "@/lib/publication/public-publication-request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const accessToken = readBearerAccessToken(request);
  if (!accessToken) return failure("公開の認証を確認できません。", 401);

  try {
    const body = (await request.json()) as unknown;
    if (!isRecord(body)) return failure("公開する内容が正しくありません。", 400);
    const input = parsePublicPublicationInternalRequest({
      manifestFileId: body.manifestFileId,
      revision: body.revision,
    });
    const preparedAssets = parsePreparedAssets(body.assets);
    if (!input || !preparedAssets) {
      return failure("公開する内容が正しくありません。", 400);
    }

    const [manifestAllowed, ...assetChecks] = await Promise.all([
      verifyDriveProjectManifestAccess({
        accessToken,
        manifestFileId: input.manifestFileId,
        projectId: input.revision.projectId,
      }),
      ...input.revision.assets.map((asset) =>
        verifyDriveAssetAccess({
          accessToken,
          projectId: input.revision.projectId,
          asset,
        }),
      ),
    ]);
    if (!manifestAllowed || assetChecks.some((allowed) => !allowed)) {
      return failure("公開対象を確認できません。", 403);
    }

    const result = await finalizePublicRevisionArtifact({
      revision: input.revision,
      preparedAssets,
      secret: requirePublicShareSecret(),
    });
    return NextResponse.json(
      { sharePath: `/share/${result.shareId}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return failure("公開ページの準備を完了できませんでした。", 503);
  }
}

function parsePreparedAssets(value: unknown): PreparedPublicAsset[] | null {
  if (!Array.isArray(value)) return null;
  const assets: PreparedPublicAsset[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.assetId !== "string" ||
      typeof item.driveFileId !== "string" ||
      typeof item.mimeType !== "string" ||
      typeof item.sizeBytes !== "number" ||
      typeof item.modifiedTime !== "string" ||
      (item.checksum !== null && typeof item.checksum !== "string") ||
      typeof item.pathname !== "string" ||
      typeof item.url !== "string"
    ) {
      return null;
    }
    assets.push(item as PreparedPublicAsset);
  }
  return assets;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
