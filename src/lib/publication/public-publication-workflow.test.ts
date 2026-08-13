import { describe, expect, it, vi } from "vitest";
import { executePublicPublicationStages } from "./public-publication-workflow";

describe("public publication activation ordering", () => {
  it("does not change Drive when public artifact preparation fails", async () => {
    const commitDrivePublication = vi.fn(async () => ({ ok: true }));
    const activatePublicRevision = vi.fn(async () => ({
      ok: true as const,
      sharePath: "/share/opaque",
    }));
    const result = await executePublicPublicationStages({
      prepareArtifact: async () => ({ ok: false }),
      commitDrivePublication,
      activatePublicRevision,
    });
    expect(result.status).toBe("preparationFailed");
    expect(commitDrivePublication).not.toHaveBeenCalled();
    expect(activatePublicRevision).not.toHaveBeenCalled();
  });

  it("does not activate when the Drive publication fails", async () => {
    const activatePublicRevision = vi.fn(async () => ({
      ok: true as const,
      sharePath: "/share/opaque",
    }));
    const result = await executePublicPublicationStages({
      prepareArtifact: async () => ({ ok: true }),
      commitDrivePublication: async () => ({ ok: false, code: "conflict" }),
      activatePublicRevision,
    });
    expect(result.status).toBe("driveFailed");
    expect(activatePublicRevision).not.toHaveBeenCalled();
  });

  it("reports activation success only after preparation and Drive commit", async () => {
    const order: string[] = [];
    const result = await executePublicPublicationStages({
      prepareArtifact: async () => {
        order.push("prepare");
        return { ok: true };
      },
      commitDrivePublication: async () => {
        order.push("drive");
        return { ok: true, revision: "private" };
      },
      activatePublicRevision: async () => {
        order.push("activate");
        return { ok: true, sharePath: "/share/opaque" };
      },
    });
    expect(order).toEqual(["prepare", "drive", "activate"]);
    expect(result.status).toBe("activated");
  });

  it("keeps the Drive success distinct when activation fails", async () => {
    const result = await executePublicPublicationStages({
      prepareArtifact: async () => ({ ok: true }),
      commitDrivePublication: async () => ({ ok: true, committed: true }),
      activatePublicRevision: async () => ({ ok: false as const }),
    });
    expect(result).toMatchObject({
      status: "activationFailed",
      drive: { ok: true, committed: true },
    });
  });
});
