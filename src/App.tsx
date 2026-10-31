import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@kb.ui/css/styles.css";
import { lazy, type ReactNode, Suspense } from "react";
import { ProvidersScreen } from "./ui/providers/ProvidersScreen";
import { TerminalBench } from "./ui/terminals/TerminalBench";
import { SnapshotsScreen, TerminalsScreen } from "./ui/terminals/TerminalsScreen";
import { AppTheme } from "./ui/theme/AppTheme";
import { parseFrame } from "./ui/walkthrough/states";
import { StateScene, useDocumentTheme, Walkthrough } from "./ui/walkthrough/Walkthrough";

// Sample workers until the Rust domain projects real ones over IPC; ?sample= and ?theme= pick one.
function TaskScreen() {
  const { scene, theme } = parseFrame(window.location.search);
  useDocumentTheme(theme);
  return <StateScene scene={scene} />;
}

// Only a VITE_SCREEN=demo build bundles the demo driver.
const DemoScreen =
  import.meta.env.VITE_SCREEN === "demo"
    ? lazy(() => import("./ui/demo/DemoScreen").then((m) => ({ default: m.DemoScreen })))
    : null;

const screens: Record<string, () => ReactNode> = {
  task: TaskScreen,
  walkthrough: Walkthrough,
  terminals: TerminalsScreen,
  snapshots: SnapshotsScreen,
  "terminal-bench": TerminalBench,
  ...(DemoScreen
    ? {
        demo: () => (
          <Suspense>
            <DemoScreen />
          </Suspense>
        ),
      }
    : {}),
};

export function App() {
  // No task list before M5, so first run opens on Providers; ?screen= picks another screen,
  // or VITE_SCREEN in a build without a query.
  const name =
    new URLSearchParams(window.location.search).get("screen") ??
    (import.meta.env.VITE_SCREEN as string | undefined);
  const Screen = name ? (screens[name] ?? ProvidersScreen) : ProvidersScreen;
  return (
    <AppTheme>
      <Screen />
    </AppTheme>
  );
}
