import type { ProviderCheck } from "./model";

export const claudeFound: ProviderCheck = {
  discovery: {
    provider: "claude",
    found: { path: "/Users/me/.local/bin/claude", version: "2.1.312" },
    rejected: [],
  },
  signin: { kind: "canary", detail: { kind: "signedIn", detail: { model: "claude-haiku-5-5" } } },
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
};
