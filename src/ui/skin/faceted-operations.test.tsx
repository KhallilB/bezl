import { readFile } from "node:fs/promises";
import { tokens } from "@kbui/tokens";
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { FacetedOperationsSkin, usePortalRoot } from "./FacetedOperationsSkin";
import { facetedOperations } from "./faceted-operations";

const documented = new Set<string>(
  [tokens.panel, tokens.status, tokens.button, tokens.dialog].flatMap((g) => Object.values(g)),
);
const semantic = new Set<string>(
  [tokens.color, tokens.space, tokens.radius].flatMap((g) => Object.values(g)),
);
const skin: Record<string, string> = facetedOperations;

describe("faceted operations skin", () => {
  test("sets documented panel, status, button and dialog properties only", () => {
    const keys = Object.keys(skin);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(documented.has(key), key).toBe(true);
  });

  test("derives every value from kbui tokens so both themes stay valid", () => {
    const ref = /^var\((--kb-(?:color|space|radius)-[a-z0-9-]+)\)$/;
    const mix = /^color-mix\(in oklab, var\((--kb-color-[a-z0-9-]+)\) \d{1,2}%, transparent\)$/;
    const filter = /^(?:(?:blur\(\d+px\)|saturate\(\d+%\)) ?)+$/;
    for (const [key, value] of Object.entries(skin)) {
      if (key === tokens.panel.backdrop) {
        expect(value, key).toMatch(filter);
        continue;
      }
      const token = ref.exec(value)?.[1] ?? mix.exec(value)?.[1];
      expect(semantic.has(token ?? ""), `${key}: ${value}`).toBe(true);
    }
  });

  test("lets the room's light through a translucent, blurred plane", () => {
    expect(skin[tokens.panel.background]).toMatch(
      /^color-mix\(in oklab, var\(--kb-color-surface\)/,
    );
    expect(skin[tokens.panel.backdrop]).toMatch(/blur\(\d+px\)/);
  });

  test("casts info light from running planes and danger light from blocked ones", () => {
    expect(skin[tokens.panel["glow-active"]]).toContain(`var(${tokens.color.info})`);
    expect(skin[tokens.panel["glow-critical"]]).toContain(`var(${tokens.color.danger})`);
  });

  test("rounds planes and turns status chips into glowing pills", () => {
    expect(skin).toHaveProperty(tokens.panel.radius);
    expect(skin[tokens.status.radius]).toBe(`var(${tokens.radius.full})`);
    expect(skin).toHaveProperty(tokens.status.glow);
  });

  test("rounds controls into pills and dialogs into soft slabs", () => {
    expect(skin[tokens.button.radius]).toBe(`var(${tokens.radius.full})`);
    expect(skin[tokens.dialog.radius]).toBe(`var(${tokens.radius.lg})`);
  });

  test("uses no .kb-* selectors and no !important", async () => {
    for (const file of ["./faceted-operations.ts", "./FacetedOperationsSkin.tsx"]) {
      const source = await readFile(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/\.kb-/);
      expect(source, file).not.toContain("!important");
    }
  });

  test("applies the values as inline custom properties on one wrapper and nothing else", () => {
    const { container } = render(
      <FacetedOperationsSkin>
        <p>child</p>
      </FacetedOperationsSkin>,
    );
    const scope = container.firstElementChild as HTMLElement;
    expect(scope).toHaveAttribute("data-skin", "faceted-operations");
    expect(scope.children).toHaveLength(1);
    for (const [key, value] of Object.entries(skin)) {
      expect(scope.style.getPropertyValue(key), key).toBe(value);
    }
  });

  test("disabled keeps the same wrapper with no custom properties", () => {
    const { container } = render(
      <FacetedOperationsSkin enabled={false}>
        <p>child</p>
      </FacetedOperationsSkin>,
    );
    const scope = container.firstElementChild as HTMLElement;
    expect(scope.tagName).toBe("DIV");
    expect(scope).not.toHaveAttribute("data-skin");
    expect(scope.getAttribute("style")).toBeNull();
  });

  test.each([true, false])("exposes its wrapper as the portal root (enabled=%s)", (enabled) => {
    let root: HTMLElement | null = null;
    function Probe() {
      root = usePortalRoot();
      return null;
    }
    const { container } = render(
      <FacetedOperationsSkin enabled={enabled}>
        <Probe />
      </FacetedOperationsSkin>,
    );
    expect(root).toBe(container.firstElementChild);
  });
});
