import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProviderCheck } from "./model";
import { Providers } from "./Providers";

/** Preflight takes seconds; a rerun keeps the last results, and runs never overlap. */
export function ProvidersScreen() {
  const [checks, setChecks] = useState<ProviderCheck[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string>();
  const running = useRef(false);
  const live = useRef(true);

  const check = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setChecking(true);
    setError(undefined);
    invoke<ProviderCheck[]>("providers_preflight")
      .then(
        (c) => live.current && setChecks(c),
        (e: unknown) => live.current && setError(String(e)),
      )
      .finally(() => {
        running.current = false;
        if (live.current) setChecking(false);
      });
  }, []);

  useEffect(() => {
    live.current = true;
    check();
    return () => {
      live.current = false;
    };
  }, [check]);

  return (
    <Providers
      checks={checks}
      checking={checking}
      onCheckAgain={check}
      {...(error ? { error } : {})}
    />
  );
}
