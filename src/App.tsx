import { PtySpike, useSpikeConfig } from "./spike/PtySpike";

export function App() {
  const cfg = useSpikeConfig();
  if (cfg?.enabled) return <PtySpike config={cfg} />;
  return <main>Bezl</main>;
}
