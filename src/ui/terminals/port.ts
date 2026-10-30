import { Channel, invoke } from "@tauri-apps/api/core";

/** `name` keys the pane's snapshots in the record. */
export type PaneSpec = { argv?: string[]; cwd?: string; name?: string; cols: number; rows: number };

export type SavedRef = { pane: string; takenAt: number };

/** A snapshot from the record: the screen as Ghostty parsed it. */
export type Saved = SavedRef & { cols: number; rows: number; plain: string; vt: string };

export type TerminalRecord = {
  /** Newest first. */
  list(): Promise<SavedRef[]>;
  open(ref: SavedRef): Promise<Saved>;
};

export type PaneOutput = {
  bytes(chunk: Uint8Array): void;
  /** `null` when the agent's exit status could not be read. */
  exit(code: number | null): void;
};

export type PaneHandle = {
  id: number;
  /** Typed input, as the agent reads it from its terminal. M5's message box writes here too. */
  write(text: string): Promise<void>;
  /** The screen drew `n` more bytes; the agent is held once `PANE_LIMIT` (128 KiB) is undrawn. */
  drawn(n: number): void;
  resize(cols: number, rows: number): void;
  /** Saves what the screen shows into the record of the pane's checkout. */
  snapshot(): Promise<SavedRef>;
  close(): void;
};

export type TerminalPort = { open(spec: PaneSpec, out: PaneOutput): Promise<PaneHandle> };

// A late ack or resize can reach a pane that was already closed.
const closed = () => {};

/** Raw bytes arrive as an `ArrayBuffer`; the exit as JSON. */
type Message = ArrayBuffer | { exit: number | null };

export const tauriPort: TerminalPort = {
  async open(spec, out) {
    const onOutput = new Channel<Message>();
    onOutput.onmessage = (m) => {
      if (m instanceof ArrayBuffer) out.bytes(new Uint8Array(m));
      else out.exit(m.exit);
    };
    const id = await invoke<number>("terminal_open", {
      argv: spec.argv ?? null,
      cwd: spec.cwd ?? null,
      name: spec.name ?? null,
      cols: spec.cols,
      rows: spec.rows,
      onOutput,
    });
    return {
      id,
      write: (data) => invoke("terminal_write", { id, data }),
      drawn: (n) => void invoke("terminal_drawn", { id, n }).catch(closed),
      resize: (cols, rows) => void invoke("terminal_resize", { id, cols, rows }).catch(closed),
      snapshot: () => invoke<SavedRef>("terminal_snapshot", { id }),
      close: () => void invoke("terminal_close", { id }).catch(closed),
    };
  },
};

export const tauriRecord: TerminalRecord = {
  list: () => invoke<SavedRef[]>("terminal_snapshots"),
  open: ({ pane, takenAt }) => invoke<Saved>("terminal_snapshot_open", { pane, takenAt }),
};
