import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { isPublicationAcceptanceFaultRuntimeEnabled } from "@/lib/publish-history/publication-acceptance-faults";
import { PublicationAcceptanceFaultPanel } from "./publication-acceptance-fault-panel";

const safeProps = {
  mode: "off" as const,
  recoveryStatus: "unavailable" as const,
  recoveryMessage: "recovery unavailable",
  selectedProjectTitle: "case-a-response-unknown",
  busy: false,
  onArm: vi.fn(),
  onDisarm: vi.fn(),
  onRecover: vi.fn(),
};

describe("publication acceptance fault panel", () => {
  it("renders no DOM when the runtime guard is OFF", () => {
    expect(
      renderToStaticMarkup(
        <PublicationAcceptanceFaultPanel enabled={false} {...safeProps} />,
      ),
    ).toBe("");
  });

  it("renders no DOM on the production origin", () => {
    const enabled = isPublicationAcceptanceFaultRuntimeEnabled({
      buildGuard: "1",
      origin: "https://ipad-slideshow-pwa.vercel.app",
    });
    expect(
      renderToStaticMarkup(
        <PublicationAcceptanceFaultPanel enabled={enabled} {...safeProps} />,
      ),
    ).toBe("");
  });

  it("renders only the acceptance controls when enabled", () => {
    const markup = renderToStaticMarkup(
      <PublicationAcceptanceFaultPanel enabled {...safeProps} />,
    );
    expect(markup).toContain("Publication acceptance fault");
    expect(markup).toContain("Preview guard: enabled");
    expect(markup).toContain("Arm A");
    expect(markup).toContain("Arm C");
    expect(markup).toContain("Recover C index");
    expect(markup).toContain("case-a-response-unknown");
  });

  it("keeps recovery unavailable unless the warning plan is ready", () => {
    const unavailable = renderToStaticMarkup(
      <PublicationAcceptanceFaultPanel
        enabled
        {...safeProps}
        mode="cConsumed"
      />,
    );
    const ready = renderToStaticMarkup(
      <PublicationAcceptanceFaultPanel
        enabled
        {...safeProps}
        mode="cConsumed"
        recoveryStatus="ready"
      />,
    );
    expect(unavailable).toMatch(/disabled=""[^>]*>Recover C index/);
    expect(ready).not.toMatch(/disabled=""[^>]*>Recover C index/);
  });

  it("does not add logging, persistence, or sensitive fields", () => {
    const source = readFileSync(
      new URL("./publication-acceptance-fault-panel.tsx", import.meta.url),
      "utf8",
    );
    for (const forbidden of [
      "console.",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "accessToken",
      "fileId",
      "revisionId",
      "operationId",
      "canonicalHash",
      "Authorization",
      "Bearer",
      "raw response",
      "write plan",
      "https://",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
