import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

vi.mock("./app-providers", () => ({
  AppProviders: ({ children }: { children: unknown }) => children,
}));

vi.mock("./service-worker-registration", () => ({
  ServiceWorkerRegistration: () => null,
}));

import { metadata, viewport } from "./layout";

type ManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
};

type WebAppManifest = {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  orientation?: string;
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
};

type MetadataIcon = {
  url: string | URL;
  sizes?: string;
  type?: string;
};

const manifest = JSON.parse(
  readFileSync(new URL("../../public/manifest.json", import.meta.url), "utf8"),
) as WebAppManifest;

function asMetadataIcons(value: unknown): MetadataIcon[] {
  if (value === undefined) {
    return [];
  }

  return (Array.isArray(value) ? value : [value]) as MetadataIcon[];
}

function readPngDimensions(path: URL) {
  const image = readFileSync(path);

  expect(image.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(image.subarray(12, 16).toString("ascii")).toBe("IHDR");

  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  };
}

describe("PWA install metadata", () => {
  it("keeps the document, Apple, and manifest identity consistent", () => {
    expect(metadata.title).toBe(manifest.name);
    expect(metadata.applicationName).toBe(manifest.name);
    expect(metadata.appleWebApp).toMatchObject({
      capable: true,
      title: manifest.name,
      statusBarStyle: "black-translucent",
    });
    expect(metadata.other).toMatchObject({
      "apple-mobile-web-app-capable": "yes",
    });
    expect(manifest.short_name).toBe(manifest.name);
    expect(metadata.description).toBe(
      "写真や動画を端末で安定して再生するためのスライドショーPWAです。",
    );
    expect(metadata.description).toBe(manifest.description);
    expect(metadata.manifest).toBe("/manifest.json");
  });

  it("preserves the install launch and presentation contract", () => {
    expect(manifest).toMatchObject({
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "any",
    });
    expect(manifest.background_color).toBe(manifest.theme_color);
    expect(viewport).toMatchObject({
      width: "device-width",
      initialScale: 1,
      themeColor: manifest.theme_color,
    });
  });

  it("references the existing 192 and 512 PNG icons with valid dimensions", () => {
    const requiredSizes = ["192x192", "512x512"];
    const documentIcons = asMetadataIcons(
      typeof metadata.icons === "object" && metadata.icons !== null
        ? metadata.icons.icon
        : undefined,
    );

    for (const sizes of requiredSizes) {
      const manifestIcon = manifest.icons.find((icon) => icon.sizes === sizes);
      const documentIcon = documentIcons.find((icon) => icon.sizes === sizes);

      expect(manifestIcon).toMatchObject({
        type: "image/png",
        purpose: "any maskable",
      });
      expect(documentIcon).toMatchObject({
        url: manifestIcon?.src,
        type: "image/png",
      });

      const [expectedWidth, expectedHeight] = sizes.split("x").map(Number);
      const iconPath = new URL(
        `../../public${manifestIcon?.src}`,
        import.meta.url,
      );
      expect(readPngDimensions(iconPath)).toEqual({
        width: expectedWidth,
        height: expectedHeight,
      });
    }
  });

  it("provides an explicit Apple touch icon from the existing artwork", () => {
    const appleIcons = asMetadataIcons(
      typeof metadata.icons === "object" && metadata.icons !== null
        ? metadata.icons.apple
        : undefined,
    );

    expect(appleIcons).toContainEqual({
      url: "/icons/icon-180.png",
      type: "image/png",
      sizes: "180x180",
    });
    expect(
      readPngDimensions(new URL("../../public/icons/icon-180.png", import.meta.url)),
    ).toEqual({
      width: 180,
      height: 180,
    });
  });
});
