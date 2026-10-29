import type { ProviderCheck, Usage } from "./model";

const unknown: Usage = { tokens: { kind: "unknown" }, limits: { kind: "unknown" } };
const canaryCounts = { input: 2, output: 4, cacheRead: 0, cacheWrite: 29763 };

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
};
