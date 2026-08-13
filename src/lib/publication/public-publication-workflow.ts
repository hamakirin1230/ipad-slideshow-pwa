export type PublicPublicationStageResult<TDrive> =
  | { status: "preparationFailed" }
  | { status: "driveFailed"; drive: TDrive }
  | { status: "activationFailed"; drive: TDrive }
  | { status: "activated"; drive: TDrive; sharePath: string };

export async function executePublicPublicationStages<
  TDrive extends { ok: boolean },
>(adapter: {
  prepareArtifact: () => Promise<{ ok: boolean }>;
  commitDrivePublication: () => Promise<TDrive>;
  activatePublicRevision: () => Promise<
    { ok: true; sharePath: string } | { ok: false }
  >;
}): Promise<PublicPublicationStageResult<TDrive>> {
  const preparation = await adapter.prepareArtifact();
  if (!preparation.ok) return { status: "preparationFailed" };

  const drive = await adapter.commitDrivePublication();
  if (!drive.ok) return { status: "driveFailed", drive };

  const activation = await adapter.activatePublicRevision();
  if (!activation.ok) return { status: "activationFailed", drive };
  return { status: "activated", drive, sharePath: activation.sharePath };
}
