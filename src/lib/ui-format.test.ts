import { describe, expect, it } from "vitest";
import { formatUiCount, formatUiDateTime } from "./ui-format";

describe("ui formatting", () => {
  it("formats user-facing datetime through seconds without milliseconds", () => {
    const formatted = formatUiDateTime("2026-06-12T21:50:49.646Z");
    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/49/);
    expect(formatted).not.toContain("646");
    expect(formatted).not.toContain("T");
  });

  it("does not represent an unknown count as zero", () => {
    expect(formatUiCount(null, "件")).toBe("—");
    expect(formatUiCount(0, "件")).toBe("0件");
  });
});
