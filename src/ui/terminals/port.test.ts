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
    return cmd === "terminal_open" ? 7 : undefined;
  }),
}));

const { tauriPort } = await import("./port");

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
      args: { argv: ["cat"], cwd: null, cols: 80, rows: 24, onOutput: lastChannel },
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
