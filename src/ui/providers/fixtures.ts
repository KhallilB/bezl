import type {
  Capability,
  Enforcement,
  ProviderCheck,
  TierOutcome,
  TiersCheck,
  Usage,
} from "./model";

const unknown: Usage = { tokens: { kind: "unknown" }, limits: { kind: "unknown" } };

const blocked = (...flag: string[]): Enforcement => ({ kind: "blocked", detail: { flag } });
const told: Enforcement = { kind: "instructionOnly" };
const claudeTools = blocked("--tools", "Read,Glob,Grep");
const codexSandbox = blocked("--sandbox", "read-only");

// `capabilities.rs` RECORD as preflight serializes it.
export const claudeEnforcement: Record<Capability, Enforcement> = {
  fileWrites: claudeTools,
  shell: claudeTools,
  mcpTools: blocked("--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}'),
  hooks: blocked("--settings", '{"disableAllHooks":true}'),
  network: claudeTools,
};
export const codexEnforcement: Record<Capability, Enforcement> = {
  fileWrites: codexSandbox,
  shell: codexSandbox,
  mcpTools: told,
  hooks: told,
  network: codexSandbox,
};
const holds = (evidence: string): TierOutcome => ({ kind: "holds", detail: { evidence } });
const tierCounts = { input: 6, output: 164, cacheRead: 15523, cacheWrite: 6439 };
const codexTierCounts = { input: 88049, output: 100, cacheRead: 77824, cacheWrite: 0 };

// The live tier probes of 2026-10-30.
const claudeTiers: TiersCheck = {
  kind: "probed",
  detail: {
    provider: "claude",
    version: "2.1.312",
    probedAt: 1793344492,
    tiers: {
      stepBoundary: holds("one -p call ran one step and ended with its result event"),
      mcpTool: holds("init lists mcp__bezl__batch_state"),
      liveInput: holds("input written mid-step reached it: the step's result names the code word"),
    },
    cost: {
      usd: 0.00152563,
      tokens: {
        kind: "known",
        detail: {
          total: tierCounts,
          models: [{ model: "claude-haiku-5-5", counts: tierCounts }],
        },
      },
    },
  },
};
const codexTiers: TiersCheck = {
  kind: "probed",
  detail: {
    provider: "codex",
    version: "0.163.0",
    probedAt: 1793344492,
    tiers: {
      stepBoundary: holds("one exec call ran one turn and ended with turn.completed"),
      mcpTool: holds("exec --json has no init tool list; the agent called bezl's batch_state"),
      liveInput: {
        kind: "missing",
        detail: {
          evidence: "codex queue took the input mid-step, but the step ended without it",
        },
      },
    },
    cost: { usd: null, tokens: { kind: "known", detail: { total: codexTierCounts, models: [] } } },
  },
};

const canaryCounts = { input: 2, output: 4, cacheRead: 0, cacheWrite: 29763 };
const probeCounts = { input: 4, output: 459, cacheRead: 12798, cacheWrite: 6718 };

export const claudeFound: ProviderCheck = {
  discovery: {
    provider: "claude",
    found: { path: "/Users/me/.local/bin/claude", version: "2.1.312" },
    rejected: [],
  },
  signin: { kind: "canary", detail: { kind: "signedIn", detail: { model: "claude-haiku-5-5" } } },
  usage: {
    tokens: {
      kind: "known",
      detail: {
        total: canaryCounts,
        models: [{ model: "claude-haiku-5-5", counts: canaryCounts }],
      },
    },
    limits: { kind: "unknown" },
  },
  // The live probe of 2026-10-29.
  readOnly: {
    kind: "probed",
    detail: {
      provider: "claude",
      version: "2.1.312",
      reviewerArgs: [
        "--tools",
        "Read,Glob,Grep",
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--settings",
        '{"disableAllHooks":true}',
      ],
      probedAt: 1793312545,
      capabilities: {
        fileWrites: { kind: "passed" },
        shell: { kind: "passed" },
        mcpTools: { kind: "passed" },
        hooks: { kind: "passed" },
        network: { kind: "passed" },
      },
      cost: {
        usd: 0.00170148,
        tokens: {
          kind: "known",
          detail: {
            total: probeCounts,
            models: [{ model: "claude-haiku-5-5", counts: probeCounts }],
          },
        },
      },
    },
  },
  tiers: claudeTiers,
  enforcement: claudeEnforcement,
};

/** Shapes from claude 2.1.312's `rate_limit_event`; the hit is the synthesized 429. */
export const claudeLimited: ProviderCheck = {
  ...claudeFound,
  usage: {
    ...claudeFound.usage,
    limits: {
      kind: "reported",
      detail: {
        windows: [
          {
            name: "five_hour",
            minutes: null,
            usedPercent: 43,
            resetsAt: 1793299200,
            reached: false,
          },
          {
            name: "seven_day",
            minutes: null,
            usedPercent: 100,
            resetsAt: 1793343600,
            reached: true,
          },
        ],
        hit: "You've hit your limit · resets 5pm",
      },
    },
  },
};

/** This machine on 2026-10-29: real claude, bun's unrelated `codex` first on PATH. */
export const thisMachine: ProviderCheck[] = [
  claudeFound,
  {
    discovery: {
      provider: "codex",
      found: null,
      rejected: [{ path: "/Users/me/.bun/bin/codex", reason: { kind: "says", detail: "0.2.3" } }],
    },
    signin: { kind: "noBinary" },
    usage: unknown,
    readOnly: { kind: "noBinary" },
    tiers: { kind: "noBinary" },
    enforcement: codexEnforcement,
  },
];

export const codexFound: ProviderCheck = {
  discovery: {
    provider: "codex",
    found: { path: "/opt/codex/bin/codex", version: "0.163.0" },
    rejected: [
      { path: "/Users/me/.bun/bin/codex", reason: { kind: "says", detail: "0.2.3" } },
      {
        path: "/usr/local/bin/codex",
        reason: { kind: "exited", detail: { code: 2, says: "boom" } },
      },
    ],
  },
  signin: {
    kind: "homes",
    detail: [
      {
        home: "operator",
        path: "/Users/me/.codex",
        signin: { kind: "signedIn", detail: "chatGpt" },
      },
      {
        home: "workers",
        path: "/Users/me/Library/Application Support/dev.bezl.app/codex-home",
        signin: { kind: "signedOut" },
      },
    ],
  },
  usage: unknown,
  // Reviewers run in the workers' home, signed out here.
  readOnly: { kind: "needsSignIn" },
  tiers: { kind: "needsSignIn" },
  enforcement: codexEnforcement,
};

/** Both homes signed in; the live probe of 2026-10-29, where MCP failed. */
export const codexProbed: ProviderCheck = {
  ...codexFound,
  discovery: { ...codexFound.discovery, rejected: [] },
  signin: {
    kind: "homes",
    detail: [
      {
        home: "operator",
        path: "/Users/me/.codex",
        signin: { kind: "signedIn", detail: "chatGpt" },
      },
      {
        home: "workers",
        path: "/Users/me/Library/Application Support/dev.bezl.app/codex-home",
        signin: { kind: "signedIn", detail: "chatGpt" },
      },
    ],
  },
  readOnly: {
    kind: "probed",
    detail: {
      provider: "codex",
      version: "0.163.0",
      reviewerArgs: ["--sandbox", "read-only"],
      probedAt: 1793313000,
      capabilities: {
        fileWrites: { kind: "passed" },
        shell: { kind: "passed" },
        mcpTools: {
          kind: "failed",
          detail: { evidence: "an MCP server from the Codex config wrote its marker" },
        },
        hooks: {
          kind: "notProbed",
          detail: { why: "Codex runs only hooks trusted in its home; not probed" },
        },
        network: { kind: "passed" },
      },
      cost: { usd: null, tokens: { kind: "unknown" } },
    },
  },
  tiers: codexTiers,
};

export const claudeSignedOut: ProviderCheck = {
  ...claudeFound,
  signin: {
    kind: "canary",
    detail: { kind: "signedOut", detail: { says: "Not logged in · Please run /login" } },
  },
  usage: unknown,
  readOnly: { kind: "needsSignIn" },
  tiers: { kind: "needsSignIn" },
};

/** Claude signed out, only an impostor `codex`: nothing can write. */
export const noWriter: ProviderCheck[] = [claudeSignedOut, thisMachine[1] as ProviderCheck];
