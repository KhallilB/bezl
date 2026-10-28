import { readFile } from "node:fs/promises";
import { tokens } from "@kb.ui/tokens";
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AppTheme, usePortalRoot } from "./AppTheme";
import { themeTokens } from "./tokens";

const documented = new Set<string>(
  [tokens.panel, tokens.status, tokens.button, tokens.dialog, tokens.progress, tokens.stat].flatMap(
    (g) => Object.values(g),
  ),
);
const semantic = new Set<string>(
  [tokens.color, tokens.space, tokens.radius].flatMap((g) => Object.values(g)),
);
const values: Record<string, string> = themeTokens;

describe("app theme", () => {
  test("sets documented panel, status, button, dialog, progress and stat properties only", () => {
    const keys = Object.keys(values);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(documented.has(key), key).toBe(true);
  });

  test("derives every value from kbui tokens so both themes stay valid", () => {
    const ref = /^var\((--kb-(?:color|space|radius)-[a-z0-9-]+)\)$/;
    const mix = /^color-mix\(in oklab, var\((--kb-color-[a-z0-9-]+)\) \d{1,2}%, transparent\)$/;
    const filter = /^(?:(?:blur\(\d+px\)|saturate\(\d+%\)) ?)+$/;
    const weight = /^[1-9]00$/;
    for (const [key, value] of Object.entries(values)) {
      if (key === tokens.panel.backdrop) {
        expect(value, key).toMatch(filter);
        continue;
      }
      if (key.endsWith("-weight")) {
        expect(value, key).toMatch(weight);
        continue;
      }
      const token = ref.exec(value)?.[1] ?? mix.exec(value)?.[1];
      expect(semantic.has(token ?? ""), `${key}: ${value}`).toBe(true);
    }
  });

  test("lets the room's light through a translucent, blurred plane", () => {
    expect(values[tokens.panel.background]).toMatch(
      /^color-mix\(in oklab, var\(--kb-color-surface\)/,
    );
    expect(values[tokens.panel.backdrop]).toMatch(/blur\(\d+px\)/);
  });

  test("casts info light from running planes and danger light from blocked ones", () => {
    expect(values[tokens.panel["glow-active"]]).toContain(`var(${tokens.color.info})`);
    expect(values[tokens.panel["glow-critical"]]).toContain(`var(${tokens.color.danger})`);
  });

  test("rounds planes and turns status chips into glowing pills", () => {
    expect(values).toHaveProperty(tokens.panel.radius);
    expect(values[tokens.status.radius]).toBe(`var(${tokens.radius.full})`);
    expect(values).toHaveProperty(tokens.status.glow);
  });

  test("fills step progress with info light", () => {
    expect(values[tokens.progress.fill]).toBe(`var(${tokens.color.info})`);
    expect(values).toHaveProperty(tokens.progress.glow);
  });

  test("sets headline numerals light", () => {
    expect(values[tokens.stat["display-weight"]]).toBe("300");
  });

  test("rounds controls into pills and dialogs into soft slabs", () => {
    expect(values[tokens.button.radius]).toBe(`var(${tokens.radius.full})`);
    expect(values[tokens.dialog.radius]).toBe(`var(${tokens.radius.lg})`);
  });

  test("uses no .kb-* selectors and no !important", async () => {
    for (const file of ["./tokens.ts", "./AppTheme.tsx"]) {
      const source = await readFile(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/\.kb-/);
      expect(source, file).not.toContain("!important");
    }
  });

  test("applies the values as inline custom properties on one wrapper and nothing else", () => {
    const { container } = render(
      <AppTheme>
        <p>child</p>
      </AppTheme>,
    );
    const scope = container.firstElementChild as HTMLElement;
    expect(scope).toHaveAttribute("data-app-theme");
    expect(scope.children).toHaveLength(1);
    for (const [key, value] of Object.entries(values)) {
      expect(scope.style.getPropertyValue(key), key).toBe(value);
    }
  });

  test("disabled keeps the same wrapper with no custom properties", () => {
    const { container } = render(
      <AppTheme enabled={false}>
        <p>child</p>
      </AppTheme>,
    );
    const scope = container.firstElementChild as HTMLElement;
    expect(scope.tagName).toBe("DIV");
    expect(scope).not.toHaveAttribute("data-app-theme");
    expect(scope.getAttribute("style")).toBeNull();
  });

  test.each([true, false])("exposes its wrapper as the portal root (enabled=%s)", (enabled) => {
    let root: HTMLElement | null = null;
    function Probe() {
      root = usePortalRoot();
      return null;
    }
    const { container } = render(
      <AppTheme enabled={enabled}>
        <Probe />
      </AppTheme>,
    );
    expect(root).toBe(container.firstElementChild);
  });
});
