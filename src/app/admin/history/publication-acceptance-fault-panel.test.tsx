import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicationAcceptanceFaultPanel } from "./publication-acceptance-fault-panel";
import { isPublicationAcceptanceFaultRuntimeEnabled } from "@/lib/publish-history/publication-acceptance-faults";

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
  it("renders nothing when the build/runtime guard is OFF", () => {
    expect(
      renderToStaticMarkup(
        <PublicationAcceptanceFaultPanel enabled={false} {...safeProps} />,
      ),
    ).toBe("");
  });

  it("renders nothing on the production origin", () => {
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

  it("renders only sanitized controls when enabled", () => {
    const markup = renderToStaticMarkup(
      <PublicationAcceptanceFaultPanel enabled {...safeProps} />,
    );
    expect(markup).toContain("Publication acceptance fault");
    expect(markup).toContain("Preview guard: enabled");
    expect(markup).toContain("Arm A");
    expect(markup).toContain("Arm C");
    expect(markup).toContain("Recover C index");
  });

  it("does not add logging, storage, or sensitive fields to the panel", () => {
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
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
