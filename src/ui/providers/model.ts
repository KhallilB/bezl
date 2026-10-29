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

export type HomeSignIn = { home: "operator" | "workers"; path: string; signin: CodexSignIn };

export type SignInCheck =
  | { kind: "noBinary" }
  | { kind: "notCheckedYet" }
  | { kind: "homes"; detail: HomeSignIn[] };

export type ProviderCheck = {
  discovery: {
    provider: ProviderId;
    found: { path: string; version: string } | null;
    rejected: { path: string; reason: Rejection }[];
  };
  signin: SignInCheck;
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

export const notCheckedYet = quiet("Not checked yet");
export const found = good("Found");
export const notFound = failed("Not found");
