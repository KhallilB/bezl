import { Button, Panel, Status } from "@kb.ui/react";
import { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { useEffect, useId, useRef, useState } from "react";
import { StateIcon } from "../task/icons";
import { type PaneState, paneStatus } from "./model";
import type { PaneHandle, SavedRef, TerminalPort } from "./port";
import { themedTerminal } from "./xterm";
import "./terminals.css";

const SCROLLBACK = 1000;

export type TerminalPaneProps = {
  port: TerminalPort;
  label: string;
  /** Omitted: the login shell. */
  argv?: string[];
  cwd?: string;
  onTerminal?: (term: Terminal) => void;
  /** Each chunk, once xterm has drawn it. */
  onDrawn?: (chunk: Uint8Array) => void;
  onExit?: (code: number | null) => void;
  /** A snapshot of this pane was saved. */
  onSnapshot?: (ref: SavedRef) => void;
  /** The handle once the agent runs, e.g. to snapshot it. */
  onHandle?: (handle: PaneHandle) => void;
};

/** One agent's terminal. The port holds the agent while `PANE_LIMIT` bytes sit undrawn here. */
export function TerminalPane({ port, label, argv, cwd, ...hooks }: TerminalPaneProps) {
  const screen = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PaneState>({ kind: "starting" });
  const [pane, setPane] = useState<PaneHandle | null>(null);
  const [snapError, setSnapError] = useState<string>();
  const headingId = useId();
  // Latest callbacks, so a new closure never restarts the agent.
  const latest = useRef(hooks);
  latest.current = hooks;
  const command = JSON.stringify(argv ?? null);

  useEffect(() => {
    const el = screen.current;
    if (!el) return;
    // DOM renderer: WebGL cost ~18 MB more per pane idle and more in bursts (scripts/terminal-bench).
    const term = themedTerminal(el, { scrollback: SCROLLBACK });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    latest.current.onTerminal?.(term);

    let handle: PaneHandle | null = null;
    let gone = false;
    let exited = false;
    // Bytes can arrive before `open` resolves; their acks wait for the handle.
    let early = 0;
    const drawn = (n: number) => {
      if (handle) handle.drawn(n);
      else early += n;
    };
    const subs = [
      term.onData((d) => void handle?.write(d)),
      term.onResize(({ cols, rows }) => handle?.resize(cols, rows)),
    ];
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(el);

    const parsed = JSON.parse(command) as string[] | null;
    const size = { cols: term.cols, rows: term.rows };
    port
      .open(
        { ...(parsed ? { argv: parsed } : {}), ...(cwd ? { cwd } : {}), name: label, ...size },
        {
          bytes(chunk) {
            if (gone) return;
            term.write(chunk, () => {
              drawn(chunk.byteLength);
              latest.current.onDrawn?.(chunk);
            });
          },
          exit(code) {
            if (gone) return;
            exited = true;
            setState({ kind: "exited", code });
            latest.current.onExit?.(code);
          },
        },
      )
      .then(
        (h) => {
          if (gone) return h.close();
          handle = h;
          setPane(h);
          latest.current.onHandle?.(h);
          if (early) h.drawn(early);
          // A fit while opening had no handle to resize.
          if (term.cols !== size.cols || term.rows !== size.rows) h.resize(term.cols, term.rows);
          if (!exited) setState({ kind: "running" });
        },
        (e: unknown) => {
          if (!gone) setState({ kind: "failed", says: e instanceof Error ? e.message : String(e) });
        },
      );
    return () => {
      gone = true;
      observer.disconnect();
      for (const s of subs) s.dispose();
      handle?.close();
      setPane(null);
      term.dispose();
    };
  }, [port, command, cwd, label]);

  const snapshot = () => {
    if (!pane) return;
    setSnapError(undefined);
    pane.snapshot().then(
      (ref) => latest.current.onSnapshot?.(ref),
      (e: unknown) => setSnapError(String(e)),
    );
  };

  const status = paneStatus(state);
  return (
    <div className="terminal-pane" data-pane>
      <Panel tone={state.kind === "running" ? "active" : "default"} aria-labelledby={headingId}>
        <Panel.Header>
          <h2 id={headingId} className="terminal-title">
            {label}
          </h2>
          <Status
            appearance="chip"
            tone={status.tone}
            icon={<StateIcon state={status.icon} />}
            live={status.live}
          >
            {status.label}
          </Status>
        </Panel.Header>
        <Panel.Body className="terminal-body">
          {state.kind === "failed" ? <p className="terminal-says">{state.says}</p> : null}
          <Panel.Well>
            <div ref={screen} className="terminal-screen" />
          </Panel.Well>
        </Panel.Body>
        <Panel.Footer>
          {snapError ? <p className="terminal-says">{snapError}</p> : null}
          <Button variant="secondary" size="sm" disabled={!pane} onClick={snapshot}>
            Snapshot
          </Button>
        </Panel.Footer>
      </Panel>
    </div>
  );
}
