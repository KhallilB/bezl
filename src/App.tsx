import "@kbui/css/styles.css";
import { useState } from "react";
import { PtySpike, useSpikeConfig } from "./spike/PtySpike";
import { ControlRoom } from "./ui/control-room/ControlRoom";
import * as samples from "./ui/control-room/fixtures";
import type { WorkerView } from "./ui/control-room/model";
import { FacetedOperationsSkin } from "./ui/skin/FacetedOperationsSkin";

// Sample workers until the Rust domain projects real ones over IPC; ?sample= picks a state.
function initialWorkers(): WorkerView[] {
  const name = new URLSearchParams(window.location.search).get("sample");
  return name && name in samples ? samples[name as keyof typeof samples] : samples.running;
}

export function App() {
  const cfg = useSpikeConfig();
  const [workers, setWorkers] = useState<WorkerView[]>(initialWorkers);
  if (cfg?.enabled) return <PtySpike config={cfg} />;
  return (
    <FacetedOperationsSkin>
      <ControlRoom
        workers={workers}
        onStop={(id) =>
          setWorkers((all) =>
            all.map((w) =>
              w.id === id ? { ...w, state: "finished", summary: "Stopped by operator." } : w,
            ),
          )
        }
      />
    </FacetedOperationsSkin>
  );
}
