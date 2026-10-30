import { tauriPort, tauriRecord } from "./port";
import { Snapshots } from "./Snapshots";
import { Terminals } from "./Terminals";

// Login shells until M5 starts real workers in their worktrees.
const shells = [{ label: "Shell 1" }, { label: "Shell 2" }, { label: "Shell 3" }];

export function TerminalsScreen() {
  return <Terminals port={tauriPort} record={tauriRecord} panes={shells} />;
}

export function SnapshotsScreen() {
  return <Snapshots record={tauriRecord} />;
}
