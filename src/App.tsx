import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@kb.ui/css/styles.css";
import { useState } from "react";
import { PtySpike, useSpikeConfig } from "./spike/PtySpike";
import { ProvidersScreen } from "./ui/providers/ProvidersScreen";
import * as samples from "./ui/task/fixtures";
import type { WorkerView } from "./ui/task/model";
import { Task } from "./ui/task/Task";
import { AppTheme } from "./ui/theme/AppTheme";

// Sample workers until the Rust domain projects real ones over IPC; ?sample= picks a state.
function initialWorkers(): WorkerView[] {
  const name = new URLSearchParams(window.location.search).get("sample");
  const pick = {
    idle: samples.idle,
    running: samples.running,
    blocked: samples.blocked,
    longContent: samples.longContent,
  };
  return name && name in pick ? pick[name as keyof typeof pick] : samples.running;
}

export function App() {
  const cfg = useSpikeConfig();
  const [workers, setWorkers] = useState<WorkerView[]>(initialWorkers);
  if (cfg?.enabled) return <PtySpike config={cfg} />;
  // No navigation yet; ?screen=providers opens the Providers screen.
  if (new URLSearchParams(window.location.search).get("screen") === "providers") {
    return (
      <AppTheme>
        <ProvidersScreen />
      </AppTheme>
    );
  }
  return (
    <AppTheme>
      <Task
        task={samples.task}
        workers={workers}
        onStop={(id) =>
          setWorkers((all) =>
            all.map((w) =>
              w.id === id ? { ...w, state: "finished", summary: "Stopped by operator." } : w,
            ),
          )
        }
      />
    </AppTheme>
  );
}
