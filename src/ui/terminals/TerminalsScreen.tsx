import { tauriPort } from "./port";
import { Terminals } from "./Terminals";

// Login shells until M5 starts real workers in their worktrees.
const shells = [{ label: "Shell 1" }, { label: "Shell 2" }, { label: "Shell 3" }];

export function TerminalsScreen() {
  return <Terminals port={tauriPort} panes={shells} />;
}
