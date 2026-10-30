import { Panel } from "@kb.ui/react";
import type { Terminal } from "@xterm/xterm";
import { useEffect, useId, useRef } from "react";
import type { Saved } from "./port";
import { themedTerminal } from "./xterm";
import "./terminals.css";

/** A saved screen, replayed read-only at the size it was taken. */
export function SnapshotViewer({
  saved,
  onTerminal,
}: {
  saved: Saved;
  onTerminal?: (t: Terminal) => void;
}) {
  const screen = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const latest = useRef(onTerminal);
  latest.current = onTerminal;

  useEffect(() => {
    const el = screen.current;
    if (!el) return;
    const term = themedTerminal(el, {
      cols: saved.cols,
      rows: saved.rows,
      scrollback: 0,
      disableStdin: true,
      cursorInactiveStyle: "none",
    });
    term.open(el);
    // Hide the cursor: the snapshot keeps the screen, not where the cursor was.
    term.write(`\x1b[?25l${saved.vt}`);
    latest.current?.(term);
    return () => term.dispose();
  }, [saved]);

  const taken = new Date(saved.takenAt);
  return (
    <div className="snapshot-viewer" data-snapshot-viewer>
      <Panel aria-labelledby={headingId}>
        <Panel.Header>
          <h2 id={headingId} className="terminal-title">
            {saved.pane}
          </h2>
          <p className="snapshot-meta">
            <time dateTime={taken.toISOString()}>{taken.toLocaleString()}</time>
            {` · ${saved.cols}×${saved.rows}`}
          </p>
        </Panel.Header>
        <Panel.Body>
          <Panel.Well>
            <div ref={screen} className="snapshot-screen" />
          </Panel.Well>
        </Panel.Body>
      </Panel>
    </div>
  );
}
