import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Vite rewrites import.meta.url in tests; resolve from the project root instead.
const root = join(process.cwd(), "src/ui");

async function cssFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory()
        ? cssFiles(join(dir, e.name))
        : e.name.endsWith(".css")
          ? [join(dir, e.name)]
          : [],
    ),
  );
  return nested.flat();
}

// Bezl styles its own elements only; kbui looks change through the app theme's token overrides.
describe("bezl stylesheets", () => {
  test("exist", async () => {
    expect((await cssFiles(root)).length).toBeGreaterThan(0);
  });

  test("never select kbui parts, force, hard-code color or override kbui tokens", async () => {
    for (const file of await cssFiles(root)) {
      const css = await readFile(file, "utf8");
      expect(css, file).not.toMatch(/\.kb-/);
      expect(css, file).not.toContain("!important");
      expect(css, file).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\(/i);
      expect(css, file).not.toMatch(/--kb-[\w-]+\s*:/);
    }
  });
});
