import type { TerminalPort } from "./port";
import { TerminalPane, type TerminalPaneProps } from "./TerminalPane";
import "./terminals.css";

export type PaneConfig = Omit<TerminalPaneProps, "port">;

/** Agent terminals side by side. Panes are keyed by position; their labels may repeat. */
export function Terminals({ port, panes }: { port: TerminalPort; panes: PaneConfig[] }) {
  return (
    <main className="terminals-screen">
      <h1 className="terminals-heading">Terminals</h1>
      <div className="terminals-grid">
        {panes.map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a pane's slot is its identity here.
          <TerminalPane key={i} port={port} {...p} />
        ))}
      </div>
    </main>
  );
}
