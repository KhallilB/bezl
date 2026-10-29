import type { StatusTone } from "@kb.ui/react";
import type { WorkerState } from "../task/model";

// Mirrors the Rust preflight report as serde writes it (`providers/preflight.rs`).
export type ProviderId = "claude" | "codex";

export type Rejection =
  | { kind: "says"; detail: string }
  | { kind: "noOutput" }
  | { kind: "exited"; detail: { code: number | null; says: string } }
  | { kind: "timedOut" }
  | { kind: "didNotStart"; detail: string };

export type RunError = { kind: "timedOut" } | { kind: "didNotStart"; detail: string };

export type CodexSignIn =
  | { kind: "signedIn"; detail: "chatGpt" | "apiKey" }
  | { kind: "signedOut" }
  | { kind: "homeMissing" }
  | { kind: "unrecognized"; detail: { code: number | null; says: string } }
  | { kind: "failed"; detail: RunError };

export type ClaudeSignIn =
  | { kind: "signedIn"; detail: { model: string } }
  | { kind: "signedOut"; detail: { says: string } }
  | { kind: "outOfQuota"; detail: { says: string } }
  | { kind: "unrecognized"; detail: { code: number | null; says: string } }
  | { kind: "failed"; detail: RunError };

export type HomeSignIn = { home: "operator" | "workers"; path: string; signin: CodexSignIn };

export type SignInCheck =
  | { kind: "noBinary" }
  | { kind: "canary"; detail: ClaudeSignIn }
  | { kind: "homes"; detail: HomeSignIn[] };

export type Counts = { input: number; output: number; cacheRead: number; cacheWrite: number };

export type Tokens =
  | { kind: "unknown" }
  | { kind: "known"; detail: { total: Counts; models: { model: string; counts: Counts }[] } };

export type LimitWindow = {
  name: string;
  minutes: number | null;
  usedPercent: number | null;
  /** Unix seconds. */
  resetsAt: number | null;
  reached: boolean | null;
};

export type Limits =
  | { kind: "unknown" }
  | { kind: "reported"; detail: { windows: LimitWindow[]; hit: string | null } };

export type Usage = { tokens: Tokens; limits: Limits };

export type ProviderCheck = {
  discovery: {
    provider: ProviderId;
    found: { path: string; version: string } | null;
    rejected: { path: string; reason: Rejection }[];
  };
  signin: SignInCheck;
  usage: Usage;
};

export const providerName: Record<ProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

export const homeName: Record<HomeSignIn["home"], string> = {
  operator: "Your Codex home",
  workers: "Workers' Codex home",
};

/** Status text, tone and shape icon; icons reuse the task screen's shapes. */
export type Shown = { label: string; tone: StatusTone; icon: WorkerState };

const quiet = (label: string): Shown => ({ label, tone: "neutral", icon: "idle" });
const good = (label: string): Shown => ({ label, tone: "success", icon: "finished" });
const needsYou = (label: string): Shown => ({ label, tone: "warning", icon: "blocked" });
const failed = (label: string): Shown => ({ label, tone: "blocked", icon: "blocked" });

export function runErrorText(error: RunError): string {
  return error.kind === "timedOut" ? "Timed out" : `Did not start: ${error.detail}`;
}

export function signinShown(signin: CodexSignIn): Shown {
  switch (signin.kind) {
    case "signedIn":
      return good(
        signin.detail === "chatGpt" ? "Signed in with ChatGPT" : "Signed in with an API key",
      );
    case "signedOut":
      return needsYou("Signed out");
    case "homeMissing":
      return quiet("No Codex home yet");
    case "unrecognized":
      return needsYou(`Unrecognized: "${signin.detail.says}"`);
    case "failed":
      return failed(runErrorText(signin.detail));
  }
}

export function canaryShown(signin: ClaudeSignIn): Shown {
  switch (signin.kind) {
    case "signedIn":
      return good(`Signed in, ${signin.detail.model} answered`);
    case "signedOut":
      return needsYou(`Signed out: "${signin.detail.says}"`);
    case "outOfQuota":
      return needsYou(`Out of quota: "${signin.detail.says}"`);
    case "unrecognized":
      return needsYou(`Unrecognized: "${signin.detail.says}"`);
    case "failed":
      return failed(runErrorText(signin.detail));
  }
}

export function rejectionText(reason: Rejection): string {
  switch (reason.kind) {
    case "says":
      return `Says "${reason.detail}"`;
    case "noOutput":
      return "Printed nothing for --version";
    case "exited":
      return `Exited with code ${reason.detail.code ?? "none"}: "${reason.detail.says}"`;
    case "timedOut":
      return "Timed out on --version";
    case "didNotStart":
      return `Did not start: ${reason.detail}`;
  }
}

export const unknownText = "unknown";

export function tokensText(tokens: Tokens): string {
  if (tokens.kind === "unknown") return unknownText;
  const n = (v: number) => v.toLocaleString("en-US");
  const { input, output, cacheRead, cacheWrite } = tokens.detail.total;
  return `${n(input)} in · ${n(output)} out · ${n(cacheRead)} cache read · ${n(cacheWrite)} cache write`;
}

/** Codex names windows `primary`/`secondary`, so its length names it instead. */
function windowName({ name, minutes }: LimitWindow): string {
  if (minutes === null) return name.replaceAll("_", " ");
  if (minutes % 1440 === 0) return `${minutes / 1440}-day`;
  if (minutes % 60 === 0) return `${minutes / 60}-hour`;
  return `${minutes}-minute`;
}

export function windowText(w: LimitWindow): string {
  const parts = [w.usedPercent === null ? "use unknown" : `${w.usedPercent}% used`];
  if (w.reached) parts.push("reached");
  if (w.resetsAt !== null) {
    const at = new Date(w.resetsAt * 1000).toLocaleString("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    parts.push(`resets ${at}`);
  }
  return `${windowName(w)}: ${parts.join(", ")}`;
}

export const limitHit = (says: string) => needsYou(`Limit hit: "${says}"`);

export const found = good("Found");
export const notFound = failed("Not found");
