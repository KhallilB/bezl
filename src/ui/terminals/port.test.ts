import { beforeEach, describe, expect, test, vi } from "vitest";

const calls: { cmd: string; args: Record<string, unknown> }[] = [];
let lastChannel: { onmessage: (m: unknown) => void } | null = null;

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage: (m: unknown) => void = () => {};
    constructor() {
      lastChannel = this;
    }
  },
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    calls.push({ cmd, args });
    if (cmd === "terminal_open") return 7;
    if (cmd === "terminal_snapshot") return { pane: "writer", takenAt: 5 };
    if (cmd === "terminal_snapshots") return [{ pane: "writer", takenAt: 5 }];
    if (cmd === "terminal_snapshot_open")
      return { pane: "writer", takenAt: 5, cols: 2, rows: 1, plain: "hi", vt: "hi" };
    return undefined;
  }),
}));

const { tauriPort, tauriRecord } = await import("./port");

function output() {
  return { bytes: vi.fn(), exit: vi.fn() };
}

beforeEach(() => {
  calls.length = 0;
  lastChannel = null;
});

describe("tauriPort", () => {
  test("opens a pane with its size and an output channel", async () => {
    const pane = await tauriPort.open({ argv: ["cat"], cols: 80, rows: 24 }, output());
    expect(pane.id).toBe(7);
    expect(calls[0]).toEqual({
      cmd: "terminal_open",
      args: { argv: ["cat"], cwd: null, name: null, cols: 80, rows: 24, onOutput: lastChannel },
    });
  });

  test("omitted argv asks for the login shell", async () => {
    await tauriPort.open({ cols: 80, rows: 24 }, output());
    expect(calls[0]?.args.argv).toBeNull();
  });

  test("routes raw bytes and the exit to the pane's output", async () => {
    const out = output();
    await tauriPort.open({ cols: 80, rows: 24 }, out);
    lastChannel?.onmessage(new Uint8Array([104, 105]).buffer);
    lastChannel?.onmessage({ exit: 3 });
    expect(out.bytes).toHaveBeenCalledWith(new Uint8Array([104, 105]));
    expect(out.exit).toHaveBeenCalledWith(3);
  });

  test("an exit with no status reaches the output as null", async () => {
    const out = output();
    await tauriPort.open({ cols: 80, rows: 24 }, out);
    lastChannel?.onmessage({ exit: null });
    expect(out.exit).toHaveBeenCalledWith(null);
  });

  test("writes input, acks drawn bytes, resizes and closes by pane id", async () => {
    const pane = await tauriPort.open({ cols: 80, rows: 24 }, output());
    await pane.write("ls\r");
    pane.drawn(4096);
    pane.resize(100, 30);
    pane.close();
    expect(calls.slice(1)).toEqual([
      { cmd: "terminal_write", args: { id: 7, data: "ls\r" } },
      { cmd: "terminal_drawn", args: { id: 7, n: 4096 } },
      { cmd: "terminal_resize", args: { id: 7, cols: 100, rows: 30 } },
      { cmd: "terminal_close", args: { id: 7 } },
    ]);
  });
});

describe("snapshots", () => {
  test("a pane is snapshotted by id, with its name as the record key", async () => {
    const pane = await tauriPort.open({ name: "Writer", cols: 80, rows: 24 }, output());
    expect(calls[0]?.args.name).toBe("Writer");
    expect(await pane.snapshot()).toEqual({ pane: "writer", takenAt: 5 });
    expect(calls[1]).toEqual({ cmd: "terminal_snapshot", args: { id: 7 } });
  });

  test("the record lists snapshots and opens one by pane and time", async () => {
    expect(await tauriRecord.list()).toEqual([{ pane: "writer", takenAt: 5 }]);
    const saved = await tauriRecord.open({ pane: "writer", takenAt: 5 });
    expect(saved.plain).toBe("hi");
    expect(calls).toEqual([
      { cmd: "terminal_snapshots", args: undefined },
      { cmd: "terminal_snapshot_open", args: { pane: "writer", takenAt: 5 } },
    ]);
  });
});
