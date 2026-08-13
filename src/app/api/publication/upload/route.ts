import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import {
  readBearerAccessToken,
  verifyDriveAssetAccess,
  verifyDriveProjectManifestAccess,
} from "@/lib/publication/public-publication-drive-server";
import {
  getPublicAssetPathname,
  requirePublicShareSecret,
} from "@/lib/publication/public-publication-identity";
import { parsePublicUploadPayload } from "@/lib/publication/public-publication-request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        const accessToken = readBearerAccessToken(request);
        const payload = parsePublicUploadPayload(clientPayload);
        if (!accessToken || !payload || !multipart) {
          throw new Error("upload authorization failed");
        }
        const [manifestAllowed, assetAllowed] = await Promise.all([
          verifyDriveProjectManifestAccess({
            accessToken,
            manifestFileId: payload.manifestFileId,
            projectId: payload.projectId,
          }),
          verifyDriveAssetAccess({
            accessToken,
            projectId: payload.projectId,
            asset: payload.asset,
          }),
        ]);
        const expectedPathname = getPublicAssetPathname({
          projectId: payload.projectId,
          asset: payload.asset,
          secret: requirePublicShareSecret(),
        });
        if (
          !manifestAllowed ||
          !assetAllowed ||
          pathname !== expectedPathname
        ) {
          throw new Error("upload authorization failed");
        }
        return {
          allowedContentTypes: [payload.asset.mimeType],
          maximumSizeInBytes: payload.asset.sizeBytes,
          validUntil: Date.now() + 15 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 31536000,
        };
      },
      onUploadCompleted: async () => {
        // Finalization verifies the immutable Blob metadata before publication.
      },
    });
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "公開素材のアップロードを許可できませんでした。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

