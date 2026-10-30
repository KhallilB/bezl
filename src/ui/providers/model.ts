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

export type Capability = "fileWrites" | "shell" | "mcpTools" | "hooks" | "network";

export type ProbeOutcome =
  | { kind: "passed" }
  | { kind: "failed"; detail: { evidence: string } }
  | { kind: "notProbed"; detail: { why: string } };

export type ProbeRecord = {
  provider: ProviderId;
  version: string;
  /** Unix seconds. */
  probedAt: number;
  capabilities: Record<Capability, ProbeOutcome>;
  /** `usd` only where the CLI reports dollars; Codex on a ChatGPT plan does not. */
  cost: { usd: number | null; tokens: Tokens };
};

/** `capabilities.rs`: `flag` is the reviewer-arg run that blocks it. */
export type Enforcement =
  | { kind: "blocked"; detail: { flag: string[] } }
  | { kind: "instructionOnly" };

export type ReadOnlyCheck =
  | { kind: "noBinary" }
  | { kind: "needsSignIn" }
  | { kind: "probed"; detail: ProbeRecord }
  | { kind: "couldNotRun"; detail: { says: string } };

export type ProviderCheck = {
  discovery: {
    provider: ProviderId;
    found: { path: string; version: string } | null;
    rejected: { path: string; reason: Rejection }[];
  };
  signin: SignInCheck;
  usage: Usage;
  readOnly: ReadOnlyCheck;
  enforcement: Record<Capability, Enforcement>;
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

/** A writer runs where its sign-in was checked: Claude's canary, Codex's workers' home. */
export function canWrite({ discovery, signin }: ProviderCheck): boolean {
  if (discovery.found === null) return false;
  if (signin.kind === "canary") return signin.detail.kind === "signedIn";
  if (signin.kind === "homes")
    return signin.detail.some((h) => h.home === "workers" && h.signin.kind === "signedIn");
  return false;
}

/** `null` when nothing can write: the screen says "No writer available". */
export function readyShown(checks: ProviderCheck[]): Shown | null {
  const names = checks.filter(canWrite).map((c) => providerName[c.discovery.provider]);
  return names.length === 0 ? null : good(`Ready: ${names.join(" and ")} can write.`);
}

/** What failed and what the operator runs; backticks mark code. Bezl never runs a sign-in. */
export type Fix = { problem: string; says?: string; action: string };

const binName: Record<ProviderId, string> = { claude: "claude", codex: "codex" };
const cliName: Record<ProviderId, string> = { claude: "Claude Code", codex: "Codex CLI" };
const install: Record<ProviderId, string> = {
  claude: "curl -fsSL https://claude.ai/install.sh | bash",
  codex: "npm install -g @openai/codex",
};

function shellQuote(s: string): string {
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`;
}

function rejectedFix(provider: ProviderId, reason: Rejection): Fix {
  const bin = `\`${binName[provider]}\``;
  const action = "Remove it from your path, or point Bezl at the real one.";
  if (reason.kind === "says")
    return {
      problem: `This ${bin} is not ${cliName[provider]}`,
      says: `Its version output says "${reason.detail}"`,
      action,
    };
  // Silence or a crash is not proof of an impostor.
  return { problem: `Bezl could not identify this ${bin}`, says: rejectionText(reason), action };
}

function canaryFix(signin: ClaudeSignIn): Fix | null {
  const see = "Run `claude` to see what it says.";
  switch (signin.kind) {
    case "signedIn":
      return null;
    case "signedOut":
      return {
        problem: "Claude Code is signed out",
        says: signin.detail.says,
        action: "Run `claude`, then `/login`.",
      };
    case "outOfQuota":
      return {
        problem: "Claude Code is out of quota",
        says: signin.detail.says,
        action: "Wait for it to reset, then Check again.",
      };
    case "unrecognized":
      return {
        problem: "Claude Code's sign-in canary was not recognized",
        says: signin.detail.says,
        action: see,
      };
    case "failed":
      return {
        problem: `Claude Code's sign-in canary: ${runErrorText(signin.detail)}`,
        action: see,
      };
  }
}

function homeFix({ home, path, signin }: HomeSignIn, operatorIn: boolean): Fix | null {
  const q = shellQuote(path);
  const env = home === "workers" ? `CODEX_HOME=${q} ` : "";
  const status = `Run \`${env}codex login status\` to see it.`;
  switch (signin.kind) {
    case "signedIn":
      return null;
    case "signedOut":
    case "homeMissing": {
      // Codex refuses a CODEX_HOME that does not exist.
      const mkdir = signin.kind === "homeMissing" ? `mkdir -p ${q} && ` : "";
      const problem =
        home === "operator"
          ? "Codex is signed out for you"
          : operatorIn
            ? "Codex is signed in for you, not for workers"
            : "Codex is signed out for workers";
      return { problem, action: `Run \`${mkdir}${env}codex login\`.` };
    }
    case "unrecognized":
      return {
        problem: `${homeName[home]}: sign-in status not recognized`,
        says: signin.detail.says,
        action: status,
      };
    case "failed":
      return {
        problem: `${homeName[home]}: ${runErrorText(signin.detail)}`,
        action: status,
      };
  }
}

export function fixes({ discovery, signin, readOnly }: ProviderCheck): Fix[] {
  const { provider } = discovery;
  if (discovery.found === null)
    return [
      ...discovery.rejected.map((r) => rejectedFix(provider, r.reason)),
      {
        problem: `No ${cliName[provider]} on your path`,
        action: `Install it: \`${install[provider]}\``,
      },
    ];
  const homes = signin.kind === "homes" ? signin.detail : [];
  const operatorIn = homes.some((h) => h.home === "operator" && h.signin.kind === "signedIn");
  const signinFixes =
    signin.kind === "canary"
      ? [canaryFix(signin.detail)]
      : homes.map((h) => homeFix(h, operatorIn));
  const probeFix: Fix | null =
    readOnly.kind === "couldNotRun"
      ? {
          problem: "The read-only probe could not run",
          says: readOnly.detail.says,
          action: "Check again to probe it again.",
        }
      : null;
  return [...signinFixes, probeFix].filter((f): f is Fix => f !== null);
}

const capabilityName: Record<Capability, string> = {
  fileWrites: "File writes",
  shell: "Shell",
  mcpTools: "MCP tools",
  hooks: "Hooks",
  network: "Network",
};
const capabilityOrder: Capability[] = ["fileWrites", "shell", "mcpTools", "hooks", "network"];

/** One row per capability: how Bezl's flags hold it, and what the probe saw (`null` unprobed). */
export type CapabilityRow = {
  capability: Capability;
  label: string;
  enforcement: string;
  outcome: Shown | null;
  note?: string;
};

function enforcementText(e: Enforcement): string {
  return e.kind === "blocked" ? `Blocked by \`${e.detail.flag.join(" ")}\`` : "Instruction only";
}

function probed(o: ProbeOutcome): Pick<CapabilityRow, "outcome" | "note"> {
  switch (o.kind) {
    case "passed":
      return { outcome: good("Passed") };
    case "failed":
      return { outcome: failed("Failed"), note: o.detail.evidence };
    case "notProbed":
      return { outcome: quiet("Not probed"), note: o.detail.why };
  }
}

export function capabilityRows({ enforcement, readOnly }: ProviderCheck): CapabilityRow[] {
  return capabilityOrder.map((capability) => ({
    capability,
    label: capabilityName[capability],
    enforcement: enforcementText(enforcement[capability]),
    ...(readOnly.kind === "probed"
      ? probed(readOnly.detail.capabilities[capability])
      : { outcome: null }),
  }));
}

/** The reviewer's overall read-only state; `null` with no binary. */
export function readOnlyShown({
  readOnly,
}: ProviderCheck): { shown: Shown; detail?: string } | null {
  switch (readOnly.kind) {
    case "noBinary":
      return null;
    case "needsSignIn":
      return { shown: needsYou("Not probed: needs sign-in") };
    case "couldNotRun":
      return { shown: failed("Could not run") };
    case "probed": {
      const { version, probedAt, capabilities } = readOnly.detail;
      const kinds = Object.values(capabilities).map((o) => o.kind);
      const on = new Date(probedAt * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const shown = kinds.includes("failed")
        ? failed("Not read-only")
        : kinds.every((k) => k === "passed")
          ? good("All five passed")
          : quiet("Partly probed");
      return { shown, detail: `Probed ${version} on ${on}` };
    }
  }
}
