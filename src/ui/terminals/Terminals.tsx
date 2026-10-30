import { Button, Dialog } from "@kb.ui/react";
import { useState } from "react";
import { usePortalRoot } from "../theme/AppTheme";
import type { Saved, TerminalPort, TerminalRecord } from "./port";
import { SnapshotViewer } from "./SnapshotViewer";
import { TerminalPane, type TerminalPaneProps } from "./TerminalPane";
import "./terminals.css";

export type PaneConfig = Omit<TerminalPaneProps, "port">;

/** Agent terminals side by side. Panes are keyed by position; their labels may repeat. */
export function Terminals({
  port,
  record,
  panes,
}: {
  port: TerminalPort;
  record?: TerminalRecord;
  panes: PaneConfig[];
}) {
  const portal = usePortalRoot();
  const [viewing, setViewing] = useState<Saved | null>(null);
  const [error, setError] = useState<string>();
  return (
    <main className="terminals-screen">
      <h1 className="terminals-heading">Terminals</h1>
      {error ? <p className="terminal-says">{error}</p> : null}
      <div className="terminals-grid">
        {panes.map((p, i) => (
          <TerminalPane
            // biome-ignore lint/suspicious/noArrayIndexKey: a pane's slot is its identity here.
            key={i}
            port={port}
            {...p}
            onSnapshot={(ref) => {
              p.onSnapshot?.(ref);
              record?.open(ref).then(setViewing, (e: unknown) => setError(String(e)));
            }}
          />
        ))}
      </div>
      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <Dialog.Content
          {...(portal ? { container: portal } : {})}
          title="Snapshot"
          description="Saved in this clone's record. The Snapshots screen lists every one."
          className="snapshot-dialog"
        >
          {viewing ? <SnapshotViewer saved={viewing} /> : null}
          <Dialog.Actions>
            <Dialog.Close render={<Button variant="secondary" />}>Close</Dialog.Close>
          </Dialog.Actions>
        </Dialog.Content>
      </Dialog>
    </main>
  );
}
