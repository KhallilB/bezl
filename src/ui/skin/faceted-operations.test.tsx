import { readFile } from "node:fs/promises";
import { tokens } from "@kbui/tokens";
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { FacetedOperationsSkin, usePortalRoot } from "./FacetedOperationsSkin";
import { facetedOperations } from "./faceted-operations";

const documented = new Set<string>(
  [tokens.facet, tokens.status, tokens.button, tokens.dialog].flatMap((g) => Object.values(g)),
);
const semantic = new Set<string>(
  [tokens.color, tokens.space, tokens.radius].flatMap((g) => Object.values(g)),
);
const skin: Record<string, string> = facetedOperations;

describe("faceted operations skin", () => {
  test("sets documented facet, status, button and dialog properties only", () => {
    const keys = Object.keys(skin);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(documented.has(key), key).toBe(true);
  });

  test("expresses every value through a kbui semantic color, space or radius token", () => {
    for (const [key, value] of Object.entries(skin)) {
      const match = /^var\((--kb-(?:color|space|radius)-[a-z0-9-]+)\)$/.exec(value);
      expect(match, `${key}: ${value}`).not.toBeNull();
      expect(semantic.has(match?.[1] ?? ""), `${key}: ${value}`).toBe(true);
    }
  });

  test("sets no cut-corner geometry: the owner dropped cuts for rounded planes", () => {
    for (const key of Object.keys(skin)) expect(key, key).not.toMatch(/^--kb-facet-cut/);
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
