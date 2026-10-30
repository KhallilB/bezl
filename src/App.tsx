import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@kb.ui/css/styles.css";
import { useState } from "react";
import { ProvidersScreen } from "./ui/providers/ProvidersScreen";
import * as samples from "./ui/task/fixtures";
import type { WorkerView } from "./ui/task/model";
import { Task } from "./ui/task/Task";
import { TerminalBench } from "./ui/terminals/TerminalBench";
import { TerminalsScreen } from "./ui/terminals/TerminalsScreen";
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
  const [workers, setWorkers] = useState<WorkerView[]>(initialWorkers);
  // No navigation yet; ?screen= opens another screen, or VITE_SCREEN in a build without a query.
  const screen = {
    providers: ProvidersScreen,
    terminals: TerminalsScreen,
    "terminal-bench": TerminalBench,
  }[
    new URLSearchParams(window.location.search).get("screen") ??
      (import.meta.env.VITE_SCREEN as string | undefined) ??
      ""
  ];
  if (screen) {
    const Screen = screen;
    return (
      <AppTheme>
        <Screen />
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
