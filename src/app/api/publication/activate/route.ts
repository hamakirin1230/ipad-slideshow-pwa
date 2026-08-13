import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isValidProjectPublishRevisionId } from "@/lib/publish-history/project-publish-revision-id";
import {
  activatePublicRevision,
  verifyPublicRevisionArtifact,
} from "@/lib/publication/public-publication-blob-server";
import {
  buildFreshPublicRevisionInput,
  readBearerAccessToken,
} from "@/lib/publication/public-publication-drive-server";
import { requirePublicShareSecret } from "@/lib/publication/public-publication-identity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const accessToken = readBearerAccessToken(request);
  if (!accessToken) return failure("公開の認証を確認できません。", 401);

  try {
    const body = (await request.json()) as unknown;
    const input = parseActivationInput(body);
    if (!input) return failure("公開版の指定が正しくありません。", 400);

    const freshRevision = await buildFreshPublicRevisionInput({
      accessToken,
      manifestFileId: input.manifestFileId,
      projectId: input.projectId,
      revisionId: input.revisionId,
    });
    if (!freshRevision?.sourceModifiedTime) {
      return failure(
        "Google Driveの現在の公開版と一致しないため、公開URLを更新しませんでした。",
        409,
      );
    }
    const secret = requirePublicShareSecret();
    if (
      !(await verifyPublicRevisionArtifact({
        revision: freshRevision,
        secret,
      }))
    ) {
      return failure(
        "公開ページの内容がGoogle Driveの現在の公開版と一致しないため、公開URLを更新しませんでした。",
        409,
      );
    }

    const confirmed = await buildFreshPublicRevisionInput({
      accessToken,
      manifestFileId: input.manifestFileId,
      projectId: input.projectId,
      revisionId: freshRevision.revisionId,
    });
    if (
      !confirmed?.sourceModifiedTime ||
      confirmed.revisionId !== freshRevision.revisionId
    ) {
      return failure(
        "Google Driveの現在の公開版と一致しないため、公開URLを更新しませんでした。",
        409,
      );
    }

    const result = await activatePublicRevision({
      projectId: input.projectId,
      revisionId: confirmed.revisionId,
      publicationTimestamp: confirmed.publishedAt,
      sourceModifiedTime: confirmed.sourceModifiedTime,
      nonce: randomUUID(),
      secret,
    });
    return NextResponse.json(
      { sharePath: result.sharePath },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return failure("公開URLの更新を完了できませんでした。", 503);
  }
}

function parseActivationInput(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const item = value as Record<string, unknown>;
  if (
    typeof item.projectId !== "string" ||
    item.projectId.trim().length === 0 ||
    typeof item.manifestFileId !== "string" ||
    item.manifestFileId.trim().length === 0 ||
    (item.revisionId !== undefined &&
      (typeof item.revisionId !== "string" ||
        !isValidProjectPublishRevisionId(item.revisionId)))
  ) {
    return null;
  }
  return {
    projectId: item.projectId,
    revisionId:
      typeof item.revisionId === "string" ? item.revisionId : undefined,
    manifestFileId: item.manifestFileId,
  };
}

function failure(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
