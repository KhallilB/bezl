import axe from "axe-core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import "@kb.ui/css/styles.css";
import { AppTheme } from "../theme/AppTheme";
import { steps } from "./tour";
import { Walkthrough } from "./Walkthrough";

let root: Root | null = null;
let host: HTMLElement | null = null;

function mount(search: string) {
  window.history.replaceState(null, "", `/${search}`);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  return new Promise<HTMLElement>((resolve) => {
    root?.render(
      <AppTheme>
        <Walkthrough />
      </AppTheme>,
    );
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(host as HTMLElement)));
  });
}

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
  window.history.replaceState(null, "", "/");
});

// Design-state steps render the Task screen, which Task.browser.test.tsx already scans.
const scanned = steps.filter((s) => s.view.kind !== "state");

for (const theme of ["dark", "light"] as const) {
  describe(theme, () => {
    for (const s of scanned) {
      test(`${s.id} passes the accessibility scan`, async () => {
        const el = await mount(`?screen=walkthrough&step=${s.id}&theme=${theme}`);
        // Overview frames load the app itself; their contents are the Task screen's scan.
        const result = await axe.run(el, { iframes: false });
        expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
      });
    }
  });
}

test("the page never scrolls sideways at phone width; the stage strip scrolls instead", async () => {
  await page.viewport(390, 844);
  const el = await mount("?screen=walkthrough&step=problems&theme=dark");
  const strip = el.querySelector<HTMLElement>(".journey-strip");
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
  expect(strip?.scrollWidth).toBeGreaterThan(strip?.clientWidth ?? 0);
});

test("the task title, stage markers, status and the stage's content share one left edge", async () => {
  await page.viewport(1280, 800);
  const el = await mount("?screen=walkthrough&step=tasks&theme=dark");
  await new Promise((r) => setTimeout(r, 400));
  const left = (selector: string) =>
    Math.round(el.querySelector(selector)?.getBoundingClientRect().left ?? -1);
  const edge = left(".journey-title h1");
  expect([
    left(".journey-marker"),
    left(".journey-status"),
    left(".journey-pane > :first-child"),
  ]).toEqual([edge, edge, edge]);
});
