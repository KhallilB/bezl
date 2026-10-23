import { readFile } from "node:fs/promises";
import { tokens } from "@kbui/tokens";
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { FacetedOperationsSkin } from "./FacetedOperationsSkin";
import { facetedOperations } from "./faceted-operations";

const documented = new Set<string>([
  ...Object.values(tokens.facet),
  ...Object.values(tokens.status),
]);
const semantic = new Set<string>([...Object.values(tokens.color), ...Object.values(tokens.space)]);

describe("faceted operations skin", () => {
  test("sets documented --kb-facet-* and --kb-status-* properties only", () => {
    const keys = Object.keys(facetedOperations);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(documented.has(key), key).toBe(true);
  });

  test("expresses every value through a kbui semantic color or space token", () => {
    for (const [key, value] of Object.entries(facetedOperations)) {
      const match = /^var\((--kb-(?:color|space)-[a-z0-9-]+)\)$/.exec(value);
      expect(match, `${key}: ${value}`).not.toBeNull();
      expect(semantic.has(match?.[1] ?? ""), `${key}: ${value}`).toBe(true);
    }
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
    for (const [key, value] of Object.entries(facetedOperations)) {
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
});
