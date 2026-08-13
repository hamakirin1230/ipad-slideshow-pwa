import { describe, expect, it } from "vitest";
import { resolveInitialPlaybackProjectId } from "./use-offline-playback-snapshot";

describe("initial offline playback project selection", () => {
  it("prefers the URL project over the previous local selection", () => {
    expect(
      resolveInitialPlaybackProjectId({
        urlProjectId: "selected-from-admin",
        storedProjectId: "previously-played",
      }),
    ).toBe("selected-from-admin");
  });

  it("keeps the existing best-effort selection when no URL project is given", () => {
    expect(
      resolveInitialPlaybackProjectId({
        urlProjectId: null,
        storedProjectId: "previously-played",
      }),
    ).toBe("previously-played");
  });
});
