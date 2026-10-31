import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { ProvidersDemo } from "./ProvidersDemo";
import { TerminalsDemo } from "./TerminalsDemo";

type Plan = { scenario: "providers" | "terminals"; out: string };

/** A milestone demo, scripted in the real app, opened by `scripts/demo/run.sh`. */
export function DemoScreen() {
  const [plan, setPlan] = useState<Plan | null | undefined>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    invoke<Plan | null>("demo_plan").then(setPlan, (e: unknown) => {
      setError(String(e));
      setPlan(null);
    });
  }, []);
  if (plan === undefined) return null;
  if (plan === null) return <p>{error ?? "No demo: run scripts/demo/run.sh."}</p>;
  return plan.scenario === "providers" ? <ProvidersDemo out={plan.out} /> : <TerminalsDemo />;
}
