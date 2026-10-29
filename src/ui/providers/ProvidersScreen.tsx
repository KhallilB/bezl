import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { ProviderCheck } from "./model";
import { Providers } from "./Providers";

/** Runs preflight once over IPC; it can take seconds, so the screen shows "checking" first. */
export function ProvidersScreen() {
  const [checks, setChecks] = useState<ProviderCheck[] | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    invoke<ProviderCheck[]>("providers_preflight").then(
      (c) => live && setChecks(c),
      (e: unknown) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, []);
  return <Providers checks={checks} {...(error ? { error } : {})} />;
}
