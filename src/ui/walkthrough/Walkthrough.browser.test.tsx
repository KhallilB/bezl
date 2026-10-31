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

function unmount() {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
  window.history.replaceState(null, "", "/");
  window.scrollTo(0, 0);
}

afterEach(unmount);

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
  const edge = left(".page-title");
  expect([
    left(".journey-marker"),
    left(".page-status"),
    left(".journey-pane > :first-child"),
  ]).toEqual([edge, edge, edge]);
});

// Screens inside the app shell; onboarding, Providers and the design states keep their own frame.
const inShell = steps.filter(
  (s) => !["choose", "providers", "state", "overview"].includes(s.view.kind),
);

/** Mounts each step in turn; `read` returns one value per step. */
async function each<T>(list: typeof steps, read: (el: HTMLElement) => T) {
  const out: Record<string, T> = {};
  for (const s of list) {
    const el = await mount(`?screen=walkthrough&step=${s.id}&theme=dark`);
    out[s.id] = read(el);
    unmount();
  }
  return out;
}

const distinct = (seen: Record<string, unknown>) => new Set(Object.values(seen).map(String));

test("every screen in the shell puts its title on one edge, one line and one size", async () => {
  await page.viewport(1440, 900);
  const seen = await each(inShell, (el) => {
    const h1 = el.querySelector("h1") as HTMLElement;
    const { left, top } = h1.getBoundingClientRect();
    return `${Math.round(left)} ${Math.round(top + window.scrollY)} ${getComputedStyle(h1).fontSize}`;
  });
  expect(distinct(seen), JSON.stringify(seen)).toHaveLength(1);
});

test("every screen in the shell is one width", async () => {
  await page.viewport(1440, 900);
  const seen = await each(inShell, (el) =>
    Math.round(el.querySelector(".shell-main > *")?.getBoundingClientRect().width ?? 0),
  );
  expect(distinct(seen), JSON.stringify(seen)).toHaveLength(1);
});

test("a header action sits at the end of the title row", async () => {
  await page.viewport(1440, 900);
  const seen = await each(
    steps.filter((s) => ["ship", "history"].includes(s.id)),
    (el) => {
      const action = el.querySelector("header button")?.getBoundingClientRect().right ?? 0;
      const page = el.querySelector(".shell-main > *")?.getBoundingClientRect().right ?? -1;
      return Math.round(page - action);
    },
  );
  expect(seen).toEqual({ ship: 0, history: 0 });
});

for (const [width, height] of [
  [390, 844],
  [768, 1024],
] as const) {
  test(`at ${width}px no step scrolls sideways`, async () => {
    await page.viewport(width, height);
    const seen = await each(
      steps.filter((s) => s.view.kind !== "overview"),
      () => document.documentElement.scrollWidth,
    );
    expect(Object.entries(seen).filter(([, w]) => w > width)).toEqual([]);
  });

  test(`at ${width}px each shell screen's title shows in the top quarter`, async () => {
    await page.viewport(width, height);
    const seen = await each(inShell, (el) =>
      Math.round((el.querySelector("h1")?.getBoundingClientRect().top ?? 0) + window.scrollY),
    );
    expect(Object.entries(seen).filter(([, top]) => top > height / 4)).toEqual([]);
  });
}

test("at phone width the open task's row scrolls into the task bar", async () => {
  await page.viewport(390, 844);
  const el = await mount("?screen=walkthrough&step=working&theme=dark");
  const bar = el.querySelector(".shell-lists")?.getBoundingClientRect();
  const row = el.querySelector(".shell-task[aria-current]")?.getBoundingClientRect();
  expect(row && bar && row.left >= bar.left && row.right <= bar.right).toBe(true);
});

const providerSteps = steps.filter((s) => s.view.kind === "providers");
const stateSteps = steps.filter((s) => s.view.kind === "state");

test("every step's title is one size, Providers and the design states included", async () => {
  await page.viewport(1440, 900);
  const seen = await each(
    steps.filter((s) => s.view.kind !== "overview"),
    (el) => getComputedStyle(el.querySelector("h1") as HTMLElement).fontSize,
  );
  expect(distinct(seen), JSON.stringify(seen)).toHaveLength(1);
});

test("Providers is one page as wide as the shell's, its action at the title row's end", async () => {
  await page.viewport(1440, 900);
  const seen = await each(providerSteps, (el) => {
    const frame = el.querySelector(".page")?.getBoundingClientRect();
    // Preflight is still checking, so it offers no Check again.
    const action = el.querySelector(".page-action")?.getBoundingClientRect() ?? frame;
    return `${Math.round(frame?.width ?? 0)} ${Math.round((frame?.right ?? 0) - (action?.right ?? 0))}`;
  });
  expect(distinct(seen), JSON.stringify(seen)).toEqual(new Set(["832 0"]));
});

test("card titles and the brand mark match the shell's", async () => {
  await page.viewport(1440, 900);
  const size = (el: Element | null) => (el ? getComputedStyle(el).fontSize : "none");
  const width = (el: Element | null) => Math.round(el?.getBoundingClientRect().width ?? 0);
  const shell = await each(
    steps.filter((s) => s.id === "review-takes"),
    (el) =>
      `${size(el.querySelector(".journey-take h2"))} ${width(el.querySelector(".shell-mark"))}`,
  );
  const cards = await each([...providerSteps, ...stateSteps], (el) =>
    [...el.querySelectorAll(".providers-panel h2, .task-cell h2")].map(size).join(),
  );
  const marks = await each(stateSteps, (el) => width(el.querySelector(".task-mark")));
  const [title, mark] = String(shell["review-takes"]).split(" ");
  // Preflight is still checking: no panels yet.
  for (const [id, sizes] of Object.entries(cards).filter(([, sizes]) => sizes)) {
    expect(new Set(sizes.split(",")), id).toEqual(new Set([title]));
  }
  expect(distinct(marks)).toEqual(new Set([mark]));
});
