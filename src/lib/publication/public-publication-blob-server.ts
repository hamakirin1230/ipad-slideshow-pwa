import {
  BlobNotFoundError,
  get,
  head,
  list,
  put,
  type ListBlobResultBlob,
} from "@vercel/blob";
import {
  buildPublicPublicationManifest,
  isValidPublicShareId,
  parsePublicPublicationManifest,
  type PreparedPublicAsset,
  type PublicPublicationManifest,
  type PublicPublicationRevisionInput,
} from "./public-publication-contract";
import {
  comparePublicActivationOrder,
  derivePublicRevisionId,
  derivePublicShareId,
  getPublicActivationPathname,
  getPublicActivationPrefix,
  getPublicAssetPathname,
  getPublicRevisionManifestPathname,
} from "./public-publication-identity";

type PublicActivationRecord = {
  schemaVersion: 1;
  publicationTimestamp: string;
  sourceModifiedTime?: string;
  publicRevisionId: string;
  manifestPathname: string;
};

export async function preparePublicAssetPlan(input: {
  projectId: string;
  revisionId: string;
  assets: PublicPublicationRevisionInput["assets"];
  secret: string;
}): Promise<PreparedPublicAsset[]> {
  return Promise.all(
    input.assets.map(async (asset) => {
      const pathname = getPublicAssetPathname({
        projectId: input.projectId,
        asset,
        secret: input.secret,
      });
      try {
        const existing = await head(pathname);
        return { ...asset, pathname, url: existing.url };
      } catch (error) {
        if (!(error instanceof BlobNotFoundError)) throw error;
        return { ...asset, pathname, url: null };
      }
    }),
  );
}

export async function finalizePublicRevisionArtifact(input: {
  revision: PublicPublicationRevisionInput;
  preparedAssets: PreparedPublicAsset[];
  secret: string;
}) {
  const expectedAssets = new Map(
    input.revision.assets.map((asset) => [asset.assetId, asset]),
  );
  if (
    expectedAssets.size !== input.revision.assets.length ||
    input.preparedAssets.length !== expectedAssets.size
  ) {
    throw new TypeError("public asset set does not match revision");
  }

  const assetUrls = new Map<string, string>();
  for (const prepared of input.preparedAssets) {
    const expected = expectedAssets.get(prepared.assetId);
    if (!expected || !prepared.url) {
      throw new TypeError("public asset is incomplete");
    }
    const expectedPathname = getPublicAssetPathname({
      projectId: input.revision.projectId,
      asset: expected,
      secret: input.secret,
    });
    if (prepared.pathname !== expectedPathname) {
      throw new TypeError("public asset pathname is invalid");
    }
    const blob = await head(prepared.url);
    if (
      blob.pathname !== expectedPathname ||
      blob.size !== expected.sizeBytes ||
      blob.contentType !== expected.mimeType
    ) {
      throw new TypeError("public asset metadata is invalid");
    }
    assetUrls.set(expected.assetId, blob.url);
  }

  const manifest = buildPublicPublicationManifest({
    revision: input.revision,
    assetUrls,
  });
  const pathname = getPublicRevisionManifestPathname({
    projectId: input.revision.projectId,
    revisionId: input.revision.revisionId,
    secret: input.secret,
  });
  const body = `${JSON.stringify(manifest)}\n`;
  await putImmutableJson(pathname, body);
  return {
    shareId: derivePublicShareId(input.revision.projectId, input.secret),
    publicRevisionId: derivePublicRevisionId({
      projectId: input.revision.projectId,
      revisionId: input.revision.revisionId,
      secret: input.secret,
    }),
    manifestPathname: pathname,
  };
}

export async function activatePublicRevision(input: {
  projectId: string;
  revisionId: string;
  publicationTimestamp: string;
  sourceModifiedTime: string;
  nonce: string;
  secret: string;
}) {
  const shareId = derivePublicShareId(input.projectId, input.secret);
  const publicRevisionId = derivePublicRevisionId(input);
  const manifestPathname = getPublicRevisionManifestPathname(input);
  await head(manifestPathname);

  const record: PublicActivationRecord = {
    schemaVersion: 1,
    publicationTimestamp: input.publicationTimestamp,
    sourceModifiedTime: input.sourceModifiedTime,
    publicRevisionId,
    manifestPathname,
  };
  const pathname = getPublicActivationPathname({
    shareId,
    sourceModifiedTime: input.sourceModifiedTime,
    publicationTimestamp: input.publicationTimestamp,
    nonce: input.nonce,
  });
  await put(pathname, `${JSON.stringify(record)}\n`, {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: 60,
  });
  return { shareId, publicRevisionId, sharePath: `/share/${shareId}` };
}

export async function verifyPublicRevisionArtifact(input: {
  revision: PublicPublicationRevisionInput;
  secret: string;
}) {
  const assetUrls = new Map<string, string>();
  for (const asset of input.revision.assets) {
    const pathname = getPublicAssetPathname({
      projectId: input.revision.projectId,
      asset,
      secret: input.secret,
    });
    const blob = await head(pathname);
    if (
      blob.pathname !== pathname ||
      blob.size !== asset.sizeBytes ||
      blob.contentType !== asset.mimeType
    ) {
      return false;
    }
    assetUrls.set(asset.assetId, blob.url);
  }
  const expected = buildPublicPublicationManifest({
    revision: input.revision,
    assetUrls,
  });
  const pathname = getPublicRevisionManifestPathname({
    projectId: input.revision.projectId,
    revisionId: input.revision.revisionId,
    secret: input.secret,
  });
  const actual = parsePublicPublicationManifest(await readJsonBlob(pathname));
  return (
    actual !== null && JSON.stringify(actual) === JSON.stringify(expected)
  );
}

export async function resolvePublicPublication(
  shareId: string,
): Promise<PublicPublicationManifest | null> {
  if (!isValidPublicShareId(shareId)) return null;
  const blobs = await listAll(getPublicActivationPrefix(shareId));
  const activations = (
    await Promise.all(
      blobs.map(async (blob) => {
        const record = await readJsonBlob(blob.pathname);
        return isPublicActivationRecord(record)
          ? { ...record, pathname: blob.pathname }
          : null;
      }),
    )
  ).filter((record) => record !== null);
  const latest = activations.sort(comparePublicActivationOrder)[0];
  if (!latest) return null;

  const activation = latest;
  const expectedRevisionPrefix = `shares/${shareId}/revisions/`;
  if (
    !activation.manifestPathname.startsWith(expectedRevisionPrefix) ||
    !activation.manifestPathname.endsWith("/manifest.json")
  ) {
    return null;
  }
  const manifest = await readJsonBlob(activation.manifestPathname);
  return parsePublicPublicationManifest(manifest);
}

async function putImmutableJson(pathname: string, body: string) {
  try {
    await put(pathname, body, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 31536000,
    });
  } catch {
    const existing = await readTextBlob(pathname);
    if (existing !== body) throw new Error("immutable public artifact conflict");
  }
}

async function listAll(prefix: string) {
  const blobs: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

async function readTextBlob(pathname: string) {
  const result = await get(pathname, { access: "public", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return new Response(result.stream).text();
}

async function readJsonBlob(pathname: string): Promise<unknown> {
  const text = await readTextBlob(pathname);
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isPublicActivationRecord(
  value: unknown,
): value is PublicActivationRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    item.schemaVersion === 1 &&
    typeof item.publicationTimestamp === "string" &&
    Number.isFinite(Date.parse(item.publicationTimestamp)) &&
    (item.sourceModifiedTime === undefined ||
      (typeof item.sourceModifiedTime === "string" &&
        Number.isFinite(Date.parse(item.sourceModifiedTime)))) &&
    typeof item.publicRevisionId === "string" &&
    isValidPublicShareId(item.publicRevisionId) &&
    typeof item.manifestPathname === "string"
  );
}
