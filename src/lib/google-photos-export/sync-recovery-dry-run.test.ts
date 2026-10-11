import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeRecoveryDriveJournalPort } from "./sync-recovery-drive-port";
import { createFakeRecoveryPhotosReadPort } from "./sync-recovery-photos-port";
import { dryRunGooglePhotosRecovery } from "./sync-recovery-dry-run";
import { stage2bFixture, stage2bPreflightInput } from "./sync-recovery-stage2b.test-fixtures";

afterEach(() => { vi.unstubAllGlobals(); });

describe("Stage 2B memory-only Dry-run", () => {
  it("T15/T16/T17 produces useful redacted normal/caption/unmanaged diagnostics", async () => {
    for (const variant of ["normal", "caption_changed", "unmanaged"] as const) {
      const f = stage2bFixture(variant);
      const input = await stage2bPreflightInput(f);
      const before = structuredClone(input);
      const report = dryRunGooglePhotosRecovery(input);
      expect(report.verdict).toBe("pass_local");
      expect(report.regenerateCandidateCount).toBe(variant === "caption_changed" ? 1 : 0);
      expect(report.protectedUnmanagedCount).toBe(variant === "unmanaged" ? 1 : 0);
      expect(input).toEqual(before);
      const dto = JSON.stringify(report);
      for (const secret of [f.journal.recoveryId, f.journal.recoverySourceFingerprint,
        f.journal.originalPending.pendingIdentity, f.photosScope.albumIdentity, f.scope.workspaceId,
        f.observation.pages[0].items[0].mediaItemId, f.desiredSlides[0].renderKey]) expect(dto).not.toContain(secret);
      expect(report.productionWriteAllowed).toBe(false);
      expect(report.atomicCommitProven).toBe(false);
      expect(report.productionBlockReasons).toHaveLength(3);
    }
  });

  it("T23/T24 causes no fetch, file save or port save during diagnosis", async () => {
    const noNetwork = vi.fn(() => { throw new Error("network is forbidden in Stage 2B tests"); });
    vi.stubGlobal("fetch", noNetwork);
    const f = stage2bFixture();
    const drive = createFakeRecoveryDriveJournalPort({ scope: f.scope, candidates: [f.journal] });
    const photos = createFakeRecoveryPhotosReadPort({ scope: f.photosScope, observation: f.observation });
    const save = vi.spyOn(drive, "save");
    const initialize = vi.spyOn(drive, "initialize");
    const input = await stage2bPreflightInput(f);
    input.drive = await drive.read(); input.photos = await photos.readAlbum();
    expect(dryRunGooglePhotosRecovery(input).verdict).toBe("pass_local");
    expect(noNetwork).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled(); expect(initialize).not.toHaveBeenCalled();
  });

  it("T24 audits the complete runtime import graph for provider/write dependencies", () => {
    const directory = dirname(fileURLToPath(import.meta.url));
    const visited = new Set<string>();
    function visit(path: string) {
      if (visited.has(path)) return;
      visited.add(path);
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/\bfetch\s*\(|\bconsole\.|process\.env|https?:\/\//);
      const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
      for (const statement of ast.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        if (statement.importClause?.isTypeOnly) continue;
        const binding = statement.importClause?.namedBindings;
        if (binding && ts.isNamedImports(binding) && binding.elements.every((element) => element.isTypeOnly)) continue;
        const specifier = statement.moduleSpecifier.text;
        expect(specifier).not.toMatch(/library-api|drive-sync-binding|sync-coordinator|sync-membership|sync-finalize|google-session|node:/);
        expect(specifier.startsWith(".")).toBe(true);
        visit(resolve(dirname(path), `${specifier}.ts`));
      }
    }
    for (const name of ["sync-recovery-dry-run", "sync-recovery-preflight", "sync-recovery-drive-port", "sync-recovery-photos-port"]) visit(resolve(directory, `${name}.ts`));
    expect(visited.size).toBeGreaterThan(4);
    for (const file of ["sync-binding.ts", "drive-sync-binding.ts", "sync-coordinator.ts", "sync-library-api.ts", "sync-membership.ts", "sync-finalize.ts"]) {
      expect(readFileSync(resolve(directory, file), "utf8")).not.toMatch(/sync-recovery-(drive-port|photos-port|preflight|dry-run)/);
    }
  });

  it("keeps permission failure and unknown response as stopped diagnoses", async () => {
    const input = await stage2bPreflightInput();
    for (const status of ["permission_denied", "response_unknown", "album_absent", "unreadable"] as const) {
      const report = dryRunGooglePhotosRecovery({ ...input, photos: { status } });
      expect(report.verdict).toBe("stopped");
      expect(report.membership.observed).toBeNull();
      expect(report.productionWriteAllowed).toBe(false);
      expect(report.remoteReverificationRequired).toBe(true);
    }
  });
});
