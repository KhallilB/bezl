import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubCheck, ProviderCheck } from "./model";
import { Providers } from "./Providers";

/** Preflight takes seconds; a rerun keeps the last results, and runs never overlap.
 * GitHub's check is apart: it returns in a second, the agent CLIs' in minutes. */
export function ProvidersScreen() {
  const [checks, setChecks] = useState<ProviderCheck[] | null>(null);
  const [github, setGithub] = useState<GitHubCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string>();
  const running = useRef(false);
  const live = useRef(true);

  const check = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setChecking(true);
    setError(undefined);
    const failed = (e: unknown) => live.current && setError(String(e));
    Promise.all([
      invoke<ProviderCheck[]>("providers_preflight").then(
        (c) => live.current && setChecks(c),
        failed,
      ),
      invoke<GitHubCheck>("github_preflight").then((g) => live.current && setGithub(g), failed),
    ]).finally(() => {
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
      github={github}
      {...(error ? { error } : {})}
    />
  );
}
