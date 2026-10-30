import type { Terminal } from "@xterm/xterm";
import axe from "axe-core";
import { type ReactNode, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import "@kb.ui/css/styles.css";
import { AppTheme } from "../theme/AppTheme";
import type { PaneHandle, PaneOutput, PaneSpec, TerminalPort } from "./port";
import { TerminalPane } from "./TerminalPane";
import { Terminals } from "./Terminals";

type FakeHandle = {
  id: number;
  write: ReturnType<typeof vi.fn<PaneHandle["write"]>>;
  drawn: ReturnType<typeof vi.fn<PaneHandle["drawn"]>>;
  resize: ReturnType<typeof vi.fn<PaneHandle["resize"]>>;
  close: ReturnType<typeof vi.fn<PaneHandle["close"]>>;
  snapshot: ReturnType<typeof vi.fn<PaneHandle["snapshot"]>>;
};
type Opened = { spec: PaneSpec; out: PaneOutput; handle: FakeHandle };

function fakePort(fail?: string) {
  const opened: Opened[] = [];
  const port: TerminalPort = {
    async open(spec, out) {
      if (fail) throw new Error(fail);
      const handle: FakeHandle = {
        id: opened.length,
        write: vi.fn<PaneHandle["write"]>(async () => {}),
        drawn: vi.fn<PaneHandle["drawn"]>(),
        resize: vi.fn<PaneHandle["resize"]>(),
        close: vi.fn<PaneHandle["close"]>(),
        snapshot: vi.fn<PaneHandle["snapshot"]>(async () => ({ pane: "writer", takenAt: 1 })),
      };
      opened.push({ spec, out, handle });
      return handle;
    },
  };
  return { port, opened };
}

let root: Root | null = null;
let host: HTMLElement | null = null;

function mount(node: ReactNode, width = 900, height = 500) {
  host = document.createElement("div");
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  document.body.append(host);
  root = createRoot(host);
  root.render(<AppTheme>{node}</AppTheme>);
  return host;
}

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
  document.documentElement.removeAttribute("data-theme");
});

const settled = (check: () => void) => vi.waitFor(check, { timeout: 3000, interval: 20 });

function line(term: Terminal, y: number) {
  return term.buffer.active.getLine(y)?.translateToString(true) ?? "";
}

describe("TerminalPane", () => {
  test("draws the agent's bytes and acks each chunk only once drawn", async () => {
    const { port, opened } = fakePort();
    let term: Terminal | undefined;
    mount(<TerminalPane port={port} label="Writer" onTerminal={(t) => (term = t)} />);
    await settled(() => expect(opened).toHaveLength(1));
    const pane = opened[0] as Opened;
    const chunk = new TextEncoder().encode("hello from bezl\r\n");
    pane.out.bytes(chunk);
    expect(pane.handle.drawn).not.toHaveBeenCalled();
    await settled(() => expect(pane.handle.drawn).toHaveBeenCalledWith(chunk.byteLength));
    expect(line(term as Terminal, 0)).toBe("hello from bezl");
  });

  test("typed keys are written to the agent", async () => {
    const { port, opened } = fakePort();
    const el = mount(<TerminalPane port={port} label="Writer" />);
    await settled(() => expect(opened).toHaveLength(1));
    const input = el.querySelector("textarea") as HTMLTextAreaElement;
    input.focus();
    await userEvent.keyboard("ls{Enter}");
    const pane = opened[0] as Opened;
    await settled(() =>
      expect(pane.handle.write.mock.calls.map((c) => c[0]).join("")).toBe("ls\r"),
    );
  });

  test("opens the agent at the fitted size and resizes it with the pane", async () => {
    const { port, opened } = fakePort();
    const el = mount(<TerminalPane port={port} label="Writer" />, 600, 400);
    await settled(() => expect(opened).toHaveLength(1));
    const { spec, handle } = opened[0] as Opened;
    expect(spec.cols).toBeGreaterThan(20);
    expect(spec.rows).toBeGreaterThan(5);
    el.style.width = "1000px";
    await settled(() => expect(handle.resize).toHaveBeenCalled());
    const [cols] = handle.resize.mock.lastCall as [number, number];
    expect(cols).toBeGreaterThan(spec.cols);
  });

  test("under StrictMode one agent stays open, and unmount closes it", async () => {
    const { port, opened } = fakePort();
    mount(
      <StrictMode>
        <TerminalPane port={port} label="Writer" />
      </StrictMode>,
    );
    await settled(() => expect(opened.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 100));
    const open = () => opened.filter((o) => o.handle.close.mock.calls.length === 0);
    expect(open()).toHaveLength(1);
    root?.unmount();
    root = null;
    expect(open()).toHaveLength(0);
  });

  test("shows the agent's exit and a failed start", async () => {
    const { port, opened } = fakePort();
    const el = mount(<TerminalPane port={port} label="Writer" />);
    await settled(() => expect(el.textContent).toContain("Running"));
    (opened[0] as Opened).out.exit(3);
    await settled(() => expect(el.textContent).toContain("Exited 3"));

    root?.unmount();
    host?.remove();
    const failing = fakePort("No such file or directory");
    const el2 = mount(<TerminalPane port={failing.port} label="Writer" />);
    await settled(() => expect(el2.textContent).toContain("Could not start"));
    expect(el2.textContent).toContain("No such file or directory");
  });
});

describe("Terminals", () => {
  const panes = [{ label: "Writer" }, { label: "Reviewer A" }, { label: "Reviewer B" }];

  for (const theme of ["light", "dark"] as const) {
    test(`has no axe violations in ${theme}`, async () => {
      document.documentElement.dataset.theme = theme;
      const { port, opened } = fakePort();
      const el = mount(<Terminals port={port} panes={panes} />, 1200, 700);
      await settled(() => expect(opened).toHaveLength(3));
      const result = await axe.run(el);
      expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }

  for (const width of [800, 1200]) {
    test(`three panes fit a ${width} px window`, async () => {
      const { port, opened } = fakePort();
      const el = mount(<Terminals port={port} panes={panes} />, width, 700);
      await settled(() => expect(opened).toHaveLength(3));
      const regions = el.querySelectorAll("[data-pane]");
      expect(regions).toHaveLength(3);
      for (const r of regions) {
        const box = r.getBoundingClientRect();
        expect(box.right).toBeLessThanOrEqual(width + 0.5);
        expect(box.width).toBeGreaterThan(200);
      }
      expect(el.scrollWidth).toBeLessThanOrEqual(width);
      if (width >= 1200) {
        const tops = [...regions].map((r) => Math.round(r.getBoundingClientRect().top));
        expect(new Set(tops).size).toBe(1);
      }
    });
  }
});
