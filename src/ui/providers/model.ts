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
  /** Launch flags probed; Rust re-probes when they change. */
  reviewerArgs: string[];
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

/** `preflight.rs` `Recorded`: a paid probe's result, kept once per CLI version. */
export type Recorded<R> =
  | { kind: "noBinary" }
  | { kind: "needsSignIn" }
  | { kind: "probed"; detail: R }
  | { kind: "couldNotRun"; detail: { says: string } };

export type ReadOnlyCheck = Recorded<ProbeRecord>;

/** `tiers.rs`: coordination tiers for batches, 0 to 2. */
export type Tier = "stepBoundary" | "mcpTool" | "liveInput";

export type TierOutcome =
  | { kind: "holds"; detail: { evidence: string } }
  | { kind: "missing"; detail: { evidence: string } }
  | { kind: "unknown"; detail: { why: string } };

export type TierRecord = {
  provider: ProviderId;
  version: string;
  /** Unix seconds. */
  probedAt: number;
  tiers: Record<Tier, TierOutcome>;
  cost: { usd: number | null; tokens: Tokens };
};

export type TiersCheck = Recorded<TierRecord>;

export type ProviderCheck = {
  discovery: {
    provider: ProviderId;
    found: { path: string; version: string } | null;
    rejected: { path: string; reason: Rejection }[];
  };
  /** Found version has contract captures; else "Untested version" (D6). */
  pinned: boolean;
  signin: SignInCheck;
  usage: Usage;
  readOnly: ReadOnlyCheck;
  tiers: TiersCheck;
  enforcement: Record<Capability, Enforcement>;
};

// Mirrors `providers/github.rs`.
export type GhSignIn =
  | { kind: "signedIn"; detail: { login: string } }
  | { kind: "signedOut" }
  | { kind: "failing"; detail: { says: string } }
  | { kind: "unrecognized"; detail: { code: number | null; says: string } }
  | { kind: "failed"; detail: RunError };

export type GitHubCheck =
  | { kind: "noBinary" }
  | { kind: "found"; detail: { path: string; version: string; signin: GhSignIn } };

export const providerName: Record<ProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

export const homeName: Record<HomeSignIn["home"], string> = {
  operator: "Codex for you",
  workers: "Codex for Bezl's agents",
};

/** Status text, tone and shape icon; icons reuse the task screen's shapes. */
export type Shown = { label: string; tone: StatusTone; icon: WorkerState };

const quiet = (label: string): Shown => ({ label, tone: "neutral", icon: "idle" });
const good = (label: string): Shown => ({ label, tone: "success", icon: "finished" });
const needsYou = (label: string): Shown => ({ label, tone: "warning", icon: "blocked" });
const failed = (label: string): Shown => ({ label, tone: "blocked", icon: "blocked" });

export function runErrorText(error: RunError): string {
  return error.kind === "timedOut" ? "Timed out" : `Didn't start: ${error.detail}`;
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
      return quiet("Not set up yet");
    case "unrecognized":
      return needsYou("Unexpected reply");
    case "failed":
      return failed(runErrorText(signin.detail));
  }
}

export function canaryShown(signin: ClaudeSignIn): Shown {
  switch (signin.kind) {
    case "signedIn":
      return good(`Signed in. ${signin.detail.model} answered a test message`);
    case "signedOut":
      return needsYou("Signed out");
    case "outOfQuota":
      return needsYou("Usage limit reached");
    case "unrecognized":
      return needsYou("Unexpected reply");
    case "failed":
      return failed(runErrorText(signin.detail));
  }
}

export function rejectionText(reason: Rejection): string {
  switch (reason.kind) {
    case "says":
      return `It printed "${reason.detail}" when Bezl asked for its version`;
    case "noOutput":
      return "It printed nothing when Bezl asked for its version";
    case "exited":
      return reason.detail.code === null
        ? `It stopped without an error code and said "${reason.detail.says}"`
        : `It stopped with error code ${reason.detail.code} and said "${reason.detail.says}"`;
    case "timedOut":
      return "It didn't answer when Bezl asked for its version";
    case "didNotStart":
      return `It didn't start: ${reason.detail}`;
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
  if (minutes === null) return name.replaceAll("_", "-");
  if (minutes % 1440 === 0) return `${minutes / 1440}-day`;
  if (minutes % 60 === 0) return `${minutes / 60}-hour`;
  return `${minutes}-minute`;
}

export function windowText(w: LimitWindow): string {
  const name = windowName(w);
  let text = w.reached
    ? `You've reached your ${name} limit`
    : w.usedPercent === null
      ? `Bezl can't tell how much of your ${name} limit you've used`
      : `You've used ${w.usedPercent}% of your ${name} limit`;
  if (w.resetsAt !== null) {
    const at = new Date(w.resetsAt * 1000).toLocaleString("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    text += `. It resets ${at}`;
  }
  return `${text}.`;
}

export const limitHit = needsYou("Usage limit reached");

export const found = good("Installed");
export const notFound = failed("Not installed");

/** A writer runs where its sign-in was checked: Claude's canary, Codex's workers' home. */
export function canWrite({ discovery, signin }: ProviderCheck): boolean {
  if (discovery.found === null) return false;
  if (signin.kind === "canary") return signin.detail.kind === "signedIn";
  if (signin.kind === "homes")
    return signin.detail.some((h) => h.home === "workers" && h.signin.kind === "signedIn");
  return false;
}

/** `null` when nothing can write; the screen then says so. */
export function readyShown(checks: ProviderCheck[]): Shown | null {
  const names = checks.filter(canWrite).map((c) => providerName[c.discovery.provider]);
  if (names.length === 0) return null;
  return good(`${names.join(" and ")} ${names.length === 1 ? "is" : "are"} ready to write code`);
}

/** What failed and what the operator runs; backticks mark code. Bezl never runs a sign-in. */
export type Fix = { problem: string; says?: string; action: string };

const binName: Record<ProviderId, string> = { claude: "claude", codex: "codex" };
const install: Record<ProviderId, string> = {
  claude: "curl -fsSL https://claude.ai/install.sh | bash",
  codex: "npm install -g @openai/codex",
};

function shellQuote(s: string): string {
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`;
}

function rejectedFix(provider: ProviderId, reason: Rejection): Fix {
  const bin = `\`${binName[provider]}\``;
  const action = "Remove it, or show Bezl where the real one is.";
  if (reason.kind === "says")
    return {
      problem: `This ${bin} isn't ${providerName[provider]}`,
      says: rejectionText(reason),
      action,
    };
  // Silence or crash: not proof it is a different program.
  return { problem: `Bezl couldn't tell what this ${bin} is`, says: rejectionText(reason), action };
}

function canaryFix(signin: ClaudeSignIn): Fix | null {
  const see = "Run `claude` to see what it says.";
  switch (signin.kind) {
    case "signedIn":
      return null;
    case "signedOut":
      return {
        problem: "Claude Code is signed out",
        says: `Claude Code said "${signin.detail.says}"`,
        action: "Run `claude`, then type `/login`.",
      };
    case "outOfQuota":
      return {
        problem: "Claude Code has reached its usage limit",
        says: `Claude Code said "${signin.detail.says}"`,
        action: "Wait for the limit to reset, then select Check again.",
      };
    case "unrecognized":
      return {
        problem: "Bezl didn't understand Claude Code's reply to a test message",
        says: `Claude Code said "${signin.detail.says}"`,
        action: see,
      };
    case "failed":
      return {
        problem:
          signin.detail.kind === "timedOut"
            ? "The test message to Claude Code timed out"
            : `Claude Code didn't start for the test message: ${signin.detail.detail}`,
        action: see,
      };
  }
}

function homeFix({ home, path, signin }: HomeSignIn, operatorIn: boolean): Fix | null {
  const q = shellQuote(path);
  const env = home === "workers" ? `CODEX_HOME=${q} ` : "";
  const status = `Run \`${env}codex login status\` to see what it says.`;
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
            ? "Codex is signed in for you, not for Bezl's agents"
            : "Codex is signed out for Bezl's agents";
      return { problem, action: `Run \`${mkdir}${env}codex login\`.` };
    }
    case "unrecognized":
      return {
        problem: `Bezl didn't understand the sign-in status for ${homeName[home]}`,
        says: `Codex said "${signin.detail.says}"`,
        action: status,
      };
    case "failed":
      return {
        problem:
          signin.detail.kind === "timedOut"
            ? `The sign-in check for ${homeName[home]} timed out`
            : `The sign-in check for ${homeName[home]} didn't start: ${signin.detail.detail}`,
        action: status,
      };
  }
}

function couldNotRunFix(problem: string, check: Recorded<unknown>): Fix | null {
  return check.kind === "couldNotRun"
    ? {
        problem,
        says: `The error was "${check.detail.says}"`,
        action: "Select Check again to retry them.",
      }
    : null;
}

export function fixes({ discovery, signin, readOnly, tiers }: ProviderCheck): Fix[] {
  const { provider } = discovery;
  if (discovery.found === null)
    return [
      ...discovery.rejected.map((r) => rejectedFix(provider, r.reason)),
      {
        problem: `${providerName[provider]} isn't installed on this computer`,
        action: `Install it with \`${install[provider]}\``,
      },
    ];
  const homes = signin.kind === "homes" ? signin.detail : [];
  const operatorIn = homes.some((h) => h.home === "operator" && h.signin.kind === "signedIn");
  const signinFixes =
    signin.kind === "canary"
      ? [canaryFix(signin.detail)]
      : homes.map((h) => homeFix(h, operatorIn));
  return [
    ...signinFixes,
    couldNotRunFix("The safety tests couldn't run", readOnly),
    couldNotRunFix("The tests for working alongside other tasks couldn't run", tiers),
  ].filter((f): f is Fix => f !== null);
}

const capabilityName: Record<Capability, string> = {
  fileWrites: "Writing files",
  shell: "Running commands",
  mcpTools: "MCP tools",
  hooks: "Hooks",
  network: "Internet access",
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
  return e.kind === "blocked"
    ? `Turned off with \`${e.detail.flag.join(" ")}\``
    : "Asked, not enforced";
}

function probed(o: ProbeOutcome): Pick<CapabilityRow, "outcome" | "note"> {
  switch (o.kind) {
    case "passed":
      return { outcome: good("Passed") };
    case "failed":
      return { outcome: failed("Failed"), note: o.detail.evidence };
    case "notProbed":
      return { outcome: quiet("Not tested"), note: o.detail.why };
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

export type Overall = { shown: Shown; detail?: string };

/** A probe's overall state; `null` with no binary. `summary` judges a probed record. */
function recordedShown<R extends { version: string; probedAt: number }>(
  check: Recorded<R>,
  summary: (record: R) => Shown,
): Overall | null {
  switch (check.kind) {
    case "noBinary":
      return null;
    case "needsSignIn":
      return { shown: needsYou("Sign in to test") };
    case "couldNotRun":
      return { shown: failed("Couldn't run") };
    case "probed": {
      const { version, probedAt } = check.detail;
      const on = new Date(probedAt * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return { shown: summary(check.detail), detail: `Tested version ${version} on ${on}` };
    }
  }
}

/** The reviewer's overall read-only state; `null` with no binary. */
export function readOnlyShown({ readOnly }: ProviderCheck): Overall | null {
  return recordedShown(readOnly, ({ capabilities }) => {
    const kinds = Object.values(capabilities).map((o) => o.kind);
    if (kinds.includes("failed")) return failed("A safety test failed");
    return kinds.every((k) => k === "passed")
      ? good("All 5 safety tests passed")
      : quiet("Some weren't tested");
  });
}

const tierName: Record<Tier, string> = {
  stepBoundary: "Gets updates between steps",
  mcpTool: "Can use Bezl's MCP tool",
  liveInput: "Gets messages mid-step",
};
const tierOrder: Tier[] = ["stepBoundary", "mcpTool", "liveInput"];

export type TierRow = { tier: Tier; label: string; outcome: Shown; note: string };

/** A missing tier is a degradation, not a failure: batches fall back to Tier 0. */
function tierOutcome(o: TierOutcome): Pick<TierRow, "outcome" | "note"> {
  switch (o.kind) {
    case "holds":
      return { outcome: good("Works"), note: o.detail.evidence };
    case "missing":
      return { outcome: quiet("Doesn't work"), note: o.detail.evidence };
    case "unknown":
      return { outcome: quiet("Unknown"), note: o.detail.why };
  }
}

/** One row per tier once probed; none before. */
export function tierRows({ tiers }: ProviderCheck): TierRow[] {
  if (tiers.kind !== "probed") return [];
  const { tiers: outcomes } = tiers.detail;
  return tierOrder.map((tier) => ({
    tier,
    label: tierName[tier],
    ...tierOutcome(outcomes[tier]),
  }));
}

export function tiersShown({ tiers }: ProviderCheck): Overall | null {
  return recordedShown(tiers, (record) => {
    const holding = tierOrder.filter((t) => record.tiers[t].kind === "holds").length;
    return holding === tierOrder.length
      ? good("All 3 work")
      : quiet(`${holding} of ${tierOrder.length} work`);
  });
}

/** D7: never blocks a writer, so nothing here is red but a run that failed. */
export function githubShown(check: GitHubCheck): Shown {
  if (check.kind === "noBinary") return needsYou("Not installed");
  const { signin } = check.detail;
  switch (signin.kind) {
    case "signedIn":
      return good(`Signed in as ${signin.detail.login}`);
    case "signedOut":
      return needsYou("Not signed in");
    case "failing":
      return needsYou("Sign-in failing");
    case "unrecognized":
      return needsYou(`Unrecognized: "${signin.detail.says}"`);
    case "failed":
      return failed(runErrorText(signin.detail));
  }
}

export const githubChecking: Shown = { label: "Checking", tone: "running", icon: "running" };

export const githubNote =
  "Needed only for Ship. Without it, or in a repository with no GitHub remote, Bezl hides the issue picker, and Ship can't open a pull request: the task finishes on a local branch.";

export function githubFixes(check: GitHubCheck): Fix[] {
  const login = "`gh auth login`";
  if (check.kind === "noBinary")
    return [
      {
        problem: "No GitHub CLI on your path",
        action: `Install it from cli.github.com (\`brew install gh\`), then run ${login}.`,
      },
    ];
  const { signin } = check.detail;
  const see = "Run `gh auth status` to see why";
  switch (signin.kind) {
    case "signedIn":
      return [];
    case "signedOut":
      return [{ problem: "GitHub CLI is not signed in", action: `Run ${login}.` }];
    case "failing":
      return [
        {
          problem: "GitHub did not accept gh's sign-in",
          says: signin.detail.says,
          action: `${see}, then ${login}.`,
        },
      ];
    case "unrecognized":
      return [
        {
          problem: "Bezl could not read `gh auth status`",
          says: signin.detail.says,
          action: "Update gh to 2.81.0 or later, then Check again.",
        },
      ];
    case "failed":
      return [{ problem: `\`gh auth status\`: ${runErrorText(signin.detail)}`, action: `${see}.` }];
  }
}
