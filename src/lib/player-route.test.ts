import { describe, expect, it } from "vitest";
import { createPlayerProjectLinkHref } from "./player-route";

describe("selected project player route", () => {
  it("uses only the normalized app project ID as a query value", () => {
    expect(createPlayerProjectLinkHref("  project-selected  ")).toEqual({
      pathname: "/player",
      query: { projectId: "project-selected" },
    });
  });

  it("does not create a fallback route without a selected project", () => {
    expect(createPlayerProjectLinkHref("   ")).toBeNull();
  });
});
