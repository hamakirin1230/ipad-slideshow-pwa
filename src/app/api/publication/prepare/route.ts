import { NextResponse } from "next/server";
import { preparePublicAssetPlan } from "@/lib/publication/public-publication-blob-server";
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
    const input = parsePublicPublicationInternalRequest(await request.json());
    if (!input) return failure("公開する内容が正しくありません。", 400);
    const secret = requirePublicShareSecret();
    const manifestAllowed = await verifyDriveProjectManifestAccess({
      accessToken,
      manifestFileId: input.manifestFileId,
      projectId: input.revision.projectId,
    });
    if (!manifestAllowed) return failure("公開対象を確認できません。", 403);

    const assetChecks = await Promise.all(
      input.revision.assets.map((asset) =>
        verifyDriveAssetAccess({
          accessToken,
          projectId: input.revision.projectId,
          asset,
        }),
      ),
    );
    if (assetChecks.some((allowed) => !allowed)) {
      return failure("公開素材を確認できません。", 403);
    }

    const assets = await preparePublicAssetPlan({
      projectId: input.revision.projectId,
      revisionId: input.revision.revisionId,
      assets: input.revision.assets,
      secret,
    });
    return NextResponse.json(
      { assets },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return failure("公開素材の準備を開始できませんでした。", 503);
  }
}

function failure(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
