import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function repoUrl(path: string) {
  return new URL(`../../${path}`, import.meta.url);
}

function readRepoFile(path: string) {
  return readFileSync(repoUrl(path), "utf8");
}

const envExample = readRepoFile(".env.example");
const gitignore = readRepoFile(".gitignore");
const docsIndex = readRepoFile("docs/README.md");
const currentContext = readRepoFile("docs/current-context.md");
const environmentSecurity = readRepoFile("docs/environment-security.md");

describe("runtime environment documentation contract", () => {
  it("provides a credential-free environment template with only the required variable", () => {
    expect(existsSync(repoUrl(".env.example"))).toBe(true);

    const assignments = envExample
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    expect(assignments).toEqual(["NEXT_PUBLIC_GOOGLE_CLIENT_ID="]);
    expect(envExample).not.toMatch(/CLIENT_SECRET|API_KEY|ACCESS_TOKEN|BEARER/i);
  });

  it("keeps real environment files ignored while allowing the template", () => {
    expect(gitignore).toMatch(/^\.env\*$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);
  });

  it("lists the environment contract as current guidance", () => {
    const currentDocs = docsIndex.slice(
      docsIndex.indexOf("## Current"),
      docsIndex.indexOf("## Historical"),
    );

    expect(currentDocs).toContain("environment-security.md");
    expect(currentContext).toContain(
      "[`environment-security.md`](environment-security.md)",
    );
    expect(environmentSecurity).toContain("Vercel Productionのみ");
    expect(environmentSecurity).toContain("pnpm@10.34.4");
    expect(environmentSecurity).toContain("NEXT_PUBLIC_GOOGLE_CLIENT_ID");
    expect(environmentSecurity).toContain("VercelではProject Environment Variables");
    expect(environmentSecurity).toContain("Authorized JavaScript origins");
  });

  it("records observed headers without claiming unvalidated hardening", () => {
    expect(environmentSecurity).toContain("Content-Security-Policy");
    expect(environmentSecurity).toContain("観測されなかった");
    expect(environmentSecurity).toContain("今回、security headerは追加しません");
    expect(environmentSecurity).toContain("Dashboard固有のsecurity設定");
    expect(environmentSecurity).not.toMatch(
      /(?:CSP|Content-Security-Policy)(?:を|は)(?:導入|設定|適用)済み/,
    );
  });
});
