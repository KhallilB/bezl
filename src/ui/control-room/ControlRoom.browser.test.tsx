import axe from "axe-core";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import "@kbui/css/styles.css";
import { FacetedOperationsSkin } from "../skin/FacetedOperationsSkin";
import { ControlRoom } from "./ControlRoom";
import { blocked, idle, longContent, running, task } from "./fixtures";

const scenarios = { idle, running, blocked, longContent };
const themes = ["light", "dark"] as const;

let root: Root | null = null;
let host: HTMLElement | null = null;

function mount(node: ReactNode, theme: (typeof themes)[number]) {
  document.documentElement.dataset.theme = theme;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  return new Promise<HTMLElement>((resolve) => {
    root?.render(node);
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(host as HTMLElement)));
  });
}

function unmount() {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
}

afterEach(unmount);

/** Markup minus the skin's inline style: what the skin must never change. */
function structure(el: HTMLElement) {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const node of clone.querySelectorAll("[style]")) node.removeAttribute("style");
  for (const node of clone.querySelectorAll("[data-skin]")) node.removeAttribute("data-skin");
  // Base UI ids are per-mount counters, not structure.
  return clone.innerHTML.replaceAll(/base-ui-_r_[0-9a-z]+_/g, "base-ui-id");
}

for (const theme of themes) {
  for (const [name, workers] of Object.entries(scenarios)) {
    for (const skinned of [false, true]) {
      const label = `${name} ${theme} ${skinned ? "skinned" : "unskinned"}`;
      describe(label, () => {
        test("passes the accessibility scan", async () => {
          const el = await mount(
            <FacetedOperationsSkin enabled={skinned}>
              <ControlRoom task={task} workers={workers} onStop={() => {}} />
            </FacetedOperationsSkin>,
            theme,
          );
          const result = await axe.run(el);
          expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
        });
      });
    }

    test(`${name} ${theme}: removing the skin changes values, never structure`, async () => {
      const on = structure(
        await mount(
          <FacetedOperationsSkin>
            <ControlRoom task={task} workers={workers} onStop={() => {}} />
          </FacetedOperationsSkin>,
          theme,
        ),
      );
      unmount();
      const off = structure(
        await mount(
          <FacetedOperationsSkin enabled={false}>
            <ControlRoom task={task} workers={workers} onStop={() => {}} />
          </FacetedOperationsSkin>,
          theme,
        ),
      );
      expect(on).toBe(off);
    });
  }
}

test.each([800, 1200])(
  "banner and grid fit a %ipx window without horizontal overflow",
  async (width) => {
    const el = await mount(
      <div style={{ width }}>
        <FacetedOperationsSkin>
          <ControlRoom task={task} workers={running} onStop={() => {}} />
        </FacetedOperationsSkin>
      </div>,
      "dark",
    );
    const room = el.querySelector<HTMLElement>(".cr-room") as HTMLElement;
    expect(room.scrollWidth).toBeLessThanOrEqual(width);
    const summary = el.querySelector<HTMLElement>(".cr-summary") as HTMLElement;
    expect(summary.getBoundingClientRect().right).toBeLessThanOrEqual(
      room.getBoundingClientRect().right,
    );
  },
);

test("orbit labels stay inside the drawing", async () => {
  for (const workers of [running, blocked]) {
    const el = await mount(<ControlRoom task={task} workers={workers} onStop={() => {}} />, "dark");
    const svg = el.querySelector<SVGSVGElement>(".cr-orbit-map") as SVGSVGElement;
    const { width } = svg.viewBox.baseVal;
    for (const text of svg.querySelectorAll<SVGTextElement>("text")) {
      const box = text.getBBox();
      expect(box.x, text.textContent ?? "").toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, text.textContent ?? "").toBeLessThanOrEqual(width);
    }
    unmount();
  }
});

test("skinned panel planes clip only the decorative pseudo-element, never the root", async () => {
  const el = await mount(
    <FacetedOperationsSkin>
      <ControlRoom task={task} workers={running} onStop={() => {}} />
    </FacetedOperationsSkin>,
    "dark",
  );
  for (const panel of el.querySelectorAll<HTMLElement>(".kb-panel")) {
    expect(getComputedStyle(panel).clipPath).toBe("none");
    expect(getComputedStyle(panel).overflow).toBe("visible");
  }
});
