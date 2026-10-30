import type { Capability, Enforcement, ProviderCheck, Usage } from "./model";

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
};

export const claudeSignedOut: ProviderCheck = {
  ...claudeFound,
  signin: {
    kind: "canary",
    detail: { kind: "signedOut", detail: { says: "Not logged in · Please run /login" } },
  },
  usage: unknown,
  readOnly: { kind: "needsSignIn" },
};

/** Claude signed out, only an impostor `codex`: nothing can write. */
export const noWriter: ProviderCheck[] = [claudeSignedOut, thisMachine[1] as ProviderCheck];
