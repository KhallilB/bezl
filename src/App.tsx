import "@kbui/css/styles.css";
import { useState } from "react";
import { PtySpike, useSpikeConfig } from "./spike/PtySpike";
import { ControlRoom } from "./ui/control-room/ControlRoom";
import { running } from "./ui/control-room/fixtures";
import type { WorkerView } from "./ui/control-room/model";
import { FacetedOperationsSkin } from "./ui/skin/FacetedOperationsSkin";

export function App() {
  const cfg = useSpikeConfig();
  // Sample workers until the Rust domain projects real ones over IPC.
  const [workers, setWorkers] = useState<WorkerView[]>(running);
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
