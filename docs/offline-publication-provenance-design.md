# Offline publication provenance design

## Goal

Goal 6 records how the current Drive manifest used by an explicit offline sync
relates to the current published revision. The provenance is descriptive
metadata. It does not change the content selected for sync, publish content,
trigger another sync, or block playback.

## Authority

Authority is ordered as follows.

1. **Drive current manifest** is the content actually fetched by offline sync.
   It may contain saved but unpublished edits.
2. **Drive current published revision** is the immutable revision named by
   `manifest.publication.currentRevisionId`. A revision is never inferred from
   list order or timestamps.
3. **IndexedDB staging snapshot** is the candidate being assembled. The player
   never selects it before validation and promotion.
4. **IndexedDB confirmed snapshot** is the last snapshot atomically validated
   and promoted on this device.
5. **Player session snapshot** is the confirmed snapshot loaded by the current
   player session. A later Drive or confirmed-store update does not replace an
   active session automatically.

Offline sync continues to copy the current manifest. It never substitutes the
published revision body and never publishes or rolls back unpublished edits.
Publish and rollback completion do not automatically run offline sync.

## Stored provenance

`OfflineProject.publicationProvenance` and
`OfflineSyncState.publicationProvenance` are optional additions to the existing
records.

| Status | Meaning | Stored requirements |
| --- | --- | --- |
| `publishedMatch` | Current manifest content exactly matches the verified current revision | revision ID, published time, and operation are required |
| `unpublishedChanges` | The publication pointer and exact revision agree, but current manifest content differs | revision ID, published time, and operation are required |
| `unpublished` | Current manifest has no publication | publication fields are forbidden |
| `needsInspection` | Publication exists but its exact revision relationship could not be formally verified | a sanitized inspection reason is required |

The sanitized inspection reasons are:

- `currentRevisionMissing`
- `publicationInconsistent`
- `historyStructureInvalid`
- `historyUnavailable`
- `publicationInvalid`

`legacyUnknown` is not stored. It is the read/view normalization for a record
that predates Goal 6 and has no provenance field. Strict validation rejects
invalid status-specific field combinations and unknown fields. Provenance never
contains a canonical hash, checksum, Drive file or folder ID, operation ID,
session ID, raw manifest, raw revision, raw metadata, raw response, or raw
error.

`sourceRevisionId` on existing asset and sync-state records retains its original
meaning and is not reused as a publish revision ID.

## Resolution

The current manifest is parsed with the formal manifest parser. If it has no
publication, the result is `unpublished`. Otherwise the exact loader receives
only `publication.currentRevisionId`.

The loaded revision must match publication `currentRevisionId`, `publishedAt`,
`operation`, and `sourceManifestCanonicalHash` against
`publication.contentCanonicalHash`. An exact match then compares the current
manifest content hash, excluding publication metadata, with the publication
content hash. Equality produces `publishedMatch`; inequality produces
`unpublishedChanges`. A rollback revision carries its validated
`restoredFromRevisionId`.

Loader failure mapping is sanitized:

- `notFound` becomes `currentRevisionMissing`
- duplicate or malformed revision structure becomes
  `publicationInconsistent` or `historyStructureInvalid`
- Drive/history read failure becomes `historyUnavailable`
- an invalid current publication becomes `publicationInvalid`

Provenance inspection failures normally continue sync as `needsInspection`.
Abort remains an abort and is never converted to a warning.

## Current manifest stale guard

The snapshot builder reads and validates manifest metadata and body before
asset acquisition. It fixes an internal guard containing:

- Drive `modifiedTime`
- the parsed manifest content canonical hash excluding publication
- publication presence and its current revision ID, published time, operation,
  and content canonical hash

After all asset metadata and Blob reads, and before any staging write, the
builder reads and validates manifest metadata and body again. Metadata and body
are read in a metadata/body/metadata sequence within each phase; disagreement
between the two metadata reads makes the phase stale instead of accepting a
mixed snapshot.

Any change in the guarded fields, including a `modifiedTime`-only change, fails
with the sanitized `staleManifest` classification. The orchestration performs
no staging write, no confirmed-store mutation, and no automatic retry. The UI
asks the operator to start a new explicit sync without exposing compared values.

## Staging and atomic promotion

Every new runtime staging project has valid provenance. Existing legacy staging
fixtures without it remain readable for compatibility, but invalid present
provenance is rejected.

Promotion keeps the existing single IndexedDB transaction. The staging
project's provenance is copied to the confirmed project and the same value is
written to the ready sync state. A present project/context mismatch fails
validation. Assets and Blob records never duplicate provenance. Stale sync-run
protection, other-project isolation, obsolete-asset cleanup, and `remoteOnly`
metadata behavior remain unchanged.

For confirmed reads and playback, both absent values normalize to
`legacyUnknown`. If both project and ready sync state have provenance, both must
be valid and equal. A mismatch is an atomic-promotion invariant violation and
is diagnosed as invalid/corrupt-equivalent. Provenance status alone never makes
an otherwise valid snapshot unplayable.

## Failure and playback policy

Invalid current manifest or metadata, identity mismatch, invalid asset
metadata, required image Blob failure, staging validation failure, promotion
failure, abort, and a stale manifest continue to fail the sync.

Missing or malformed history and failures limited to provenance inspection
produce `needsInspection` and allow an otherwise valid sync to complete.

All five display states (`publishedMatch`, `unpublishedChanges`, `unpublished`,
`needsInspection`, and normalized `legacyUnknown`) remain playable.
Warnings appear in project selection and ordinary status/settings information,
not as a permanent production or presentation overlay. No automatic player
reload, playback-lock change, swipe change, auto-advance change, remote-video
retry change, or video attribute change is introduced.

## Migration and security

`OFFLINE_DB_VERSION` and `OFFLINE_SCHEMA_VERSION` remain `1`; object stores are
unchanged. There is no startup migration or background rewrite. Legacy
confirmed records remain usable, and the next successful explicit offline sync
naturally replaces them with provenance-bearing records.

Access tokens remain inside the existing provider/runtime boundary. Public
summaries and UI views contain only the sanitized status, label, message,
severity/warning, logical revision ID when applicable, published time,
operation, restored-from revision, and sanitized inspection reason.
