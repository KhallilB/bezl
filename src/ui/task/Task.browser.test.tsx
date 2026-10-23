import axe from "axe-core";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import "@kbui/css/styles.css";
import { AppTheme } from "../theme/AppTheme";
import { blocked, idle, longContent, running, task } from "./fixtures";
import { Task } from "./Task";

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

/** Markup minus the theme's inline style: what the theme must never change. */
function structure(el: HTMLElement) {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const node of clone.querySelectorAll("[style]")) node.removeAttribute("style");
  for (const node of clone.querySelectorAll("[data-app-theme]"))
    node.removeAttribute("data-app-theme");
  // Base UI ids are per-mount counters, not structure.
  return clone.innerHTML.replaceAll(/base-ui-_r_[0-9a-z]+_/g, "base-ui-id");
}

for (const theme of themes) {
  for (const [name, workers] of Object.entries(scenarios)) {
    for (const themed of [false, true]) {
      const label = `${name} ${theme} ${themed ? "themed" : "unthemed"}`;
      describe(label, () => {
        test("passes the accessibility scan", async () => {
          const el = await mount(
            <AppTheme enabled={themed}>
              <Task task={task} workers={workers} onStop={() => {}} />
            </AppTheme>,
            theme,
          );
          const result = await axe.run(el);
          expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
        });
      });
    }

    test(`${name} ${theme}: removing the app theme changes values, never structure`, async () => {
      const on = structure(
        await mount(
          <AppTheme>
            <Task task={task} workers={workers} onStop={() => {}} />
          </AppTheme>,
          theme,
        ),
      );
      unmount();
      const off = structure(
        await mount(
          <AppTheme enabled={false}>
            <Task task={task} workers={workers} onStop={() => {}} />
          </AppTheme>,
          theme,
        ),
      );
      expect(on).toBe(off);
    });
  }
}

test.each([800, 1200])(
  "task header and grid fit a %ipx window without horizontal overflow",
  async (width) => {
    const el = await mount(
      <div style={{ width }}>
        <AppTheme>
          <Task task={task} workers={running} onStop={() => {}} />
        </AppTheme>
      </div>,
      "dark",
    );
    const room = el.querySelector<HTMLElement>(".task-screen") as HTMLElement;
    expect(room.scrollWidth).toBeLessThanOrEqual(width);
    const summary = el.querySelector<HTMLElement>(".task-summary") as HTMLElement;
    expect(summary.getBoundingClientRect().right).toBeLessThanOrEqual(
      room.getBoundingClientRect().right,
    );
  },
);

test("worker map labels stay inside the drawing", async () => {
  for (const workers of [running, blocked]) {
    const el = await mount(<Task task={task} workers={workers} onStop={() => {}} />, "dark");
    const svg = el.querySelector<SVGSVGElement>(".task-worker-map") as SVGSVGElement;
    const { width } = svg.viewBox.baseVal;
    for (const text of svg.querySelectorAll<SVGTextElement>("text")) {
      const box = text.getBBox();
      expect(box.x, text.textContent ?? "").toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, text.textContent ?? "").toBeLessThanOrEqual(width);
    }
    unmount();
  }
});

test("themed panel planes clip only the decorative pseudo-element, never the root", async () => {
  const el = await mount(
    <AppTheme>
      <Task task={task} workers={running} onStop={() => {}} />
    </AppTheme>,
    "dark",
  );
  for (const panel of el.querySelectorAll<HTMLElement>(".kb-panel")) {
    expect(getComputedStyle(panel).clipPath).toBe("none");
    expect(getComputedStyle(panel).overflow).toBe("visible");
  }
});
