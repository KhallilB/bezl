import type { Terminal } from "@xterm/xterm";
import axe from "axe-core";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import "@kb.ui/css/styles.css";
import { AppTheme } from "../theme/AppTheme";
import type { PaneHandle, PaneOutput, Saved, SavedRef, TerminalPort, TerminalRecord } from "./port";
import { Snapshots } from "./Snapshots";
import { SnapshotViewer } from "./SnapshotViewer";
import { Terminals } from "./Terminals";
import { replayRows, screenRows } from "./xterm";

// What Ghostty's VT formatter gave for this screen (screen.rs): rows split by CRLF.
const saved: Saved = {
  pane: "writer",
  takenAt: Date.UTC(2026, 9, 29, 12, 0, 0),
  cols: 12,
  rows: 4,
  plain: "red plain\nsecond\n0123456789ab\ncdef",
  vt: "\x1b[0m\x1b[38;5;1mred\x1b[0m plain\r\nsecond\r\n0123456789ab\r\ncdef",
};

function fakeRecord(items: Saved[] = [saved]) {
  const record: TerminalRecord & { open: ReturnType<typeof vi.fn<TerminalRecord["open"]>> } = {
    list: async () => items.map(({ pane, takenAt }) => ({ pane, takenAt })),
    open: vi.fn<TerminalRecord["open"]>(async (ref: SavedRef) => {
      const hit = items.find((s) => s.pane === ref.pane && s.takenAt === ref.takenAt);
      if (!hit) throw new Error("not found");
      return hit;
    }),
  };
  return record;
}

function fakePort() {
  const handles: (PaneHandle & { out: PaneOutput })[] = [];
  const port: TerminalPort = {
    async open(_spec, out) {
      const h = {
        id: handles.length,
        out,
        write: async () => {},
        drawn: () => {},
        resize: () => {},
        close: () => {},
        snapshot: vi.fn(async () => ({ pane: saved.pane, takenAt: saved.takenAt })),
      };
      handles.push(h);
      return h;
    },
  };
  return { port, handles };
}

let root: Root | null = null;
let host: HTMLElement | null = null;

function mount(node: ReactNode) {
  host = document.createElement("div");
  host.style.width = "1200px";
  host.style.height = "700px";
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
});

const settled = (check: () => void) => vi.waitFor(check, { timeout: 3000, interval: 20 });

describe("SnapshotViewer", () => {
  test("replays the snapshot at its size, and its rows match the saved text", async () => {
    let term: Terminal | undefined;
    const el = mount(<SnapshotViewer saved={saved} onTerminal={(t) => (term = t)} />);
    await settled(() => expect(term && screenRows(term)[3]).toBe("cdef"));
    const t = term as Terminal;
    expect([t.cols, t.rows]).toEqual([12, 4]);
    expect(screenRows(t)).toEqual(saved.plain.split("\n"));
    expect(el.textContent).toContain("writer");
  });

  test("is read-only", async () => {
    let term: Terminal | undefined;
    mount(<SnapshotViewer saved={saved} onTerminal={(t) => (term = t)} />);
    await settled(() => expect(term).toBeDefined());
    expect(term?.options.disableStdin).toBe(true);
  });
});

describe("matching a snapshot to the screen", () => {
  test("a replay gives the saved rows", async () => {
    expect(await replayRows(saved)).toEqual(saved.plain.split("\n"));
  });

  test("the screen is the visible rows, not the scrollback", async () => {
    const el = document.createElement("div");
    document.body.append(el);
    const { Terminal } = await import("@xterm/xterm");
    const term = new Terminal({ cols: 10, rows: 2, scrollback: 100 });
    term.open(el);
    await new Promise<void>((r) => term.write("a\r\nb\r\nc\r\nd", r));
    expect(screenRows(term)).toEqual(["c", "d"]);
    term.dispose();
    el.remove();
  });
});

describe("taking a snapshot", () => {
  test("a pane's Snapshot button saves it and opens it in the viewer", async () => {
    const { port, handles } = fakePort();
    const record = fakeRecord();
    const el = mount(<Terminals port={port} record={record} panes={[{ label: "Writer" }]} />);
    const button = await vi.waitFor(() => {
      const b = [...el.querySelectorAll("button")].find((b) => b.textContent === "Snapshot");
      if (!b || b.disabled) throw new Error("no enabled Snapshot button");
      return b;
    });
    button.click();
    await settled(() => expect(handles[0]?.snapshot).toHaveBeenCalled());
    await settled(() =>
      expect(record.open).toHaveBeenCalledWith({ pane: "writer", takenAt: saved.takenAt }),
    );
    await settled(() => expect(document.querySelector("[data-snapshot-viewer]")).not.toBeNull());
  });
});

describe("Snapshots", () => {
  test("lists the record and reopens a snapshot", async () => {
    const other: Saved = { ...saved, pane: "reviewer-a", takenAt: saved.takenAt - 60_000 };
    const record = fakeRecord([saved, other]);
    const el = mount(<Snapshots record={record} />);
    const items = await vi.waitFor(() => {
      const b = [...el.querySelectorAll("li button")];
      if (b.length !== 2) throw new Error("not listed");
      return b;
    });
    expect(items.map((b) => b.textContent)).toEqual([
      expect.stringContaining("writer"),
      expect.stringContaining("reviewer-a"),
    ]);
    (items[1] as HTMLButtonElement).click();
    await settled(() =>
      expect(record.open).toHaveBeenCalledWith({ pane: "reviewer-a", takenAt: other.takenAt }),
    );
    await settled(() => expect(el.querySelector("[data-snapshot-viewer]")).not.toBeNull());
  });

  for (const theme of ["light", "dark"] as const) {
    test(`has no axe violations with a snapshot open in ${theme}`, async () => {
      document.documentElement.dataset.theme = theme;
      const record = fakeRecord();
      const el = mount(<Snapshots record={record} />);
      const item = await vi.waitFor(() => {
        const b = el.querySelector("li button");
        if (!b) throw new Error("not listed");
        return b as HTMLButtonElement;
      });
      item.click();
      await settled(() => expect(el.querySelector("[data-snapshot-viewer]")).not.toBeNull());
      const result = await axe.run(el);
      expect(
        result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(", ")}`),
      ).toEqual([]);
      document.documentElement.removeAttribute("data-theme");
    });
  }

  test("an empty record says so", async () => {
    const el = mount(<Snapshots record={fakeRecord([])} />);
    await settled(() => expect(el.textContent).toContain("No snapshots yet"));
  });
});
