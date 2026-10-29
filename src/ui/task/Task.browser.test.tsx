import axe from "axe-core";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import "@kb.ui/css/styles.css";
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

/** Compare semantic markup without theme values or measured geometry. */
function structure(el: HTMLElement) {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const node of clone.querySelectorAll("[style]")) node.removeAttribute("style");
  for (const node of clone.querySelectorAll("[data-app-theme]"))
    node.removeAttribute("data-app-theme");
  for (const node of clone.querySelectorAll(".kb-scrollarea, .kb-scrollarea *")) {
    for (const axis of ["x", "y"]) {
      node.removeAttribute(`data-has-overflow-${axis}`);
      node.removeAttribute(`data-overflow-${axis}-start`);
      node.removeAttribute(`data-overflow-${axis}-end`);
    }
  }
  // Hidden scrollbar decorations mount after overflow measurement.
  for (const node of clone.querySelectorAll('.kb-scrollarea-scrollbar[aria-hidden="true"]'))
    node.remove();
  // React useId values vary per mount.
  return clone.innerHTML.replaceAll(/_r_[0-9a-z]+_/g, "_r_id_");
}

test("structure ignores measured overflow but preserves semantics and children", () => {
  const plain = document.createElement("div");
  plain.innerHTML =
    '<div class="kb-scrollarea" role="presentation"><div role="region" aria-label="Output"><pre>Output</pre></div></div>';
  const measured = plain.cloneNode(true) as HTMLElement;
  const region = measured.querySelector('[role="region"]') as HTMLElement;
  for (const node of measured.querySelectorAll(".kb-scrollarea, .kb-scrollarea *")) {
    for (const axis of ["x", "y"]) {
      node.setAttribute(`data-has-overflow-${axis}`, "");
      node.setAttribute(`data-overflow-${axis}-start`, "");
      node.setAttribute(`data-overflow-${axis}-end`, "");
    }
  }
  const scrollbar = document.createElement("div");
  scrollbar.className = "kb-scrollarea-scrollbar";
  scrollbar.setAttribute("aria-hidden", "true");
  measured.querySelector(".kb-scrollarea")?.append(scrollbar);
  expect(structure(measured)).toBe(structure(plain));
  scrollbar.removeAttribute("aria-hidden");
  expect(structure(measured)).not.toBe(structure(plain));
  scrollbar.setAttribute("aria-hidden", "true");
  region.setAttribute("aria-label", "Other output");
  expect(structure(measured)).not.toBe(structure(plain));
  region.setAttribute("aria-label", "Output");
  region.append(document.createElement("p"));
  expect(structure(measured)).not.toBe(structure(plain));
});

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

test.each(themes)("long output stays focusable and scrollable in %s", async (theme) => {
  for (const enabled of [false, true]) {
    const el = await mount(
      <div style={{ width: 800 }}>
        <AppTheme enabled={enabled}>
          <Task task={task} workers={longContent} onStop={() => {}} />
        </AppTheme>
      </div>,
      theme,
    );
    const viewport = el.querySelector(
      '[role="region"][aria-label="Worker B output"]',
    ) as HTMLElement;
    expect(viewport.clientHeight).toBeGreaterThan(0);
    expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
    viewport.focus();
    expect(document.activeElement).toBe(viewport);
    viewport.scrollTop = viewport.scrollHeight;
    await expect.poll(() => viewport.scrollTop).toBeGreaterThan(0);
    unmount();
  }
});

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

test.each(["light", "dark"] as const)(
  "worker map pools glow in the node's own color (%s)",
  async (theme) => {
    const el = await mount(<Task task={task} workers={running} onStop={() => {}} />, theme);
    const pool = el.querySelector<SVGElement>('[data-node="b"] .task-node-pool') as SVGElement;
    const ring = el.querySelector<SVGElement>('[data-node="b"] .task-node-ring') as SVGElement;
    expect(getComputedStyle(pool).fill).toBe(getComputedStyle(ring).stroke);
  },
);

test("worker map labels never overlap with a writer and five reviewers", async () => {
  const crowd = [
    ...running.filter((w) => w.role === "primary"),
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`,
      name: `Reviewer ${i + 1}`,
      role: "reviewer" as const,
      provider: "Claude Code",
      state: "idle" as const,
      summary: "Waiting.",
    })),
  ];
  const el = await mount(<Task task={task} workers={crowd} onStop={() => {}} />, "dark");
  const svg = el.querySelector<SVGSVGElement>(".task-worker-map") as SVGSVGElement;
  const { width, height } = svg.viewBox.baseVal;
  const boxes = [...svg.querySelectorAll<SVGGElement>("[data-node]")].map((node) => {
    const texts = [...node.querySelectorAll<SVGTextElement>("text")].map((t) => t.getBBox());
    const x = Math.min(...texts.map((b) => b.x));
    const y = Math.min(...texts.map((b) => b.y));
    const right = Math.max(...texts.map((b) => b.x + b.width));
    const bottom = Math.max(...texts.map((b) => b.y + b.height));
    return { x, y, right, bottom };
  });
  for (const b of boxes) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(width);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.bottom).toBeLessThanOrEqual(height);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i] as (typeof boxes)[number];
      const b = boxes[j] as (typeof boxes)[number];
      const apart = a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y;
      expect(apart, `labels ${i} and ${j} overlap`).toBe(true);
    }
  }
});

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

test("panels rise in once, staggered, unless motion is reduced", async () => {
  const el = await mount(
    <AppTheme>
      <Task task={task} workers={running} onStop={() => {}} />
    </AppTheme>,
    "dark",
  );
  const styles = [...el.querySelectorAll<HTMLElement>(".task-cell")].map((c) =>
    getComputedStyle(c),
  );
  expect(styles.length).toBe(3);
  if (reducedMotion()) {
    for (const s of styles) expect(s.animationName).toBe("none");
    return;
  }
  for (const s of styles) {
    expect(s.animationName).toBe("task-rise");
    expect(s.animationIterationCount).toBe("1");
  }
  const delay = (s: CSSStyleDeclaration) => Number.parseFloat(s.animationDelay);
  expect(delay(styles[1] as CSSStyleDeclaration)).toBeGreaterThan(
    delay(styles[0] as CSSStyleDeclaration),
  );
});

test("the write edge draws in and the activity trace sweeps in, once", async () => {
  const el = await mount(<Task task={task} workers={running} onStop={() => {}} />, "dark");
  const expected: [string, string][] = [
    ['.task-edge[data-access="write"]', "task-draw"],
    [".task-trace-line", "task-reveal"],
    [".task-trace-fill", "task-reveal"],
  ];
  for (const [selector, name] of expected) {
    const s = getComputedStyle(el.querySelector(selector) as Element);
    if (reducedMotion()) expect(s.animationName, selector).toBe("none");
    else {
      expect(s.animationName, selector).toBe(name);
      expect(s.animationIterationCount, selector).toBe("1");
    }
  }
});

test("the comet runs beneath the hub, never over its label", async () => {
  const el = await mount(<Task task={task} workers={running} onStop={() => {}} />, "dark");
  const comet = el.querySelector("[data-packet]");
  if (reducedMotion()) {
    expect(comet).toBeNull();
    return;
  }
  const hub = el.querySelector("[data-hub]") as Element;
  expect(comet?.compareDocumentPosition(hub)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});

test.each(["running", "blocked"] as const)(
  "only a running writer moves continuously (%s)",
  async (state) => {
    const workers = state === "running" ? running : blocked;
    const el = await mount(<Task task={task} workers={workers} onStop={() => {}} />, "dark");
    const looping = [...el.querySelectorAll<Element>("*")].filter((n) => {
      const s = getComputedStyle(n);
      return s.animationName !== "none" && s.animationIterationCount === "infinite";
    });
    if (reducedMotion() || state === "blocked") {
      expect(looping).toEqual([]);
      return;
    }
    expect(looping.length).toBeGreaterThan(0);
    for (const n of looping) expect(n.closest("[data-packet]")).not.toBeNull();
  },
);

test("branch names keep their case in footers", async () => {
  const el = await mount(
    <AppTheme>
      <Task task={task} workers={running} onStop={() => {}} />
    </AppTheme>,
    "dark",
  );
  const footers = [...el.querySelectorAll<HTMLElement>(".kb-panel-footer")];
  const meta = footers.flatMap((f) =>
    [...f.querySelectorAll<HTMLElement>("*")].filter((n) =>
      n.childNodes[0]?.textContent?.includes("feat/policy-engine"),
    ),
  );
  expect(meta.length).toBeGreaterThan(0);
  for (const node of meta) expect(getComputedStyle(node).textTransform).toBe("none");
  // Long branches must truncate; an inline-flex badge would ignore the ellipsis.
  for (const node of meta) expect(getComputedStyle(node).display).toBe("block");
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
