import { describe, expect, test } from "vitest";
import {
  claudeFound,
  claudeSignedOut,
  codexFound,
  codexProbed,
  noWriter,
  thisMachine,
} from "./fixtures";
import {
  type CodexSignIn,
  canWrite,
  capabilityRows,
  fixes,
  type HomeSignIn,
  type ProviderCheck,
  readOnlyShown,
} from "./model";

const workersPath = "/Users/me/Library/Application Support/dev.bezl.app/codex-home";
const quotedWorkers = `'${workersPath}'`;

function codexWith(operator: CodexSignIn, workers: CodexSignIn): ProviderCheck {
  const homes: HomeSignIn[] = [
    { home: "operator", path: "/Users/me/.codex", signin: operator },
    { home: "workers", path: workersPath, signin: workers },
  ];
  return { ...codexProbed, signin: { kind: "homes", detail: homes } };
}

const signedIn: CodexSignIn = { kind: "signedIn", detail: "chatGpt" };
const signedOut: CodexSignIn = { kind: "signedOut" };

describe("canWrite", () => {
  test("Claude can write once its canary signs in", () => {
    expect(canWrite(claudeFound)).toBe(true);
    expect(canWrite(claudeSignedOut)).toBe(false);
  });

  test("Codex can write only when the workers' home is signed in", () => {
    expect(canWrite(codexProbed)).toBe(true);
    expect(canWrite(codexWith(signedIn, signedOut))).toBe(false);
    expect(canWrite(codexWith(signedOut, signedIn))).toBe(true);
  });

  test("nothing writes without an identified binary", () => {
    expect(noWriter.map(canWrite)).toEqual([false, false]);
    expect(canWrite(thisMachine[1] as ProviderCheck)).toBe(false);
  });
});

describe("fixes", () => {
  test("a passing CLI needs nothing", () => {
    expect(fixes(claudeFound)).toEqual([]);
    expect(fixes(codexProbed)).toEqual([]);
  });

  test("an impostor says what its version output says, then what to install", () => {
    expect(fixes(thisMachine[1] as ProviderCheck)).toEqual([
      {
        problem: "This `codex` is not Codex CLI",
        says: 'Its version output says "0.2.3"',
        action: "Remove it from your path, or point Bezl at the real one.",
      },
      {
        problem: "No Codex CLI on your path",
        action: "Install it: `npm install -g @openai/codex`",
      },
    ]);
  });

  test("a binary that would not answer is not called an impostor", () => {
    const broken: ProviderCheck = {
      ...(thisMachine[1] as ProviderCheck),
      discovery: {
        provider: "codex",
        found: null,
        rejected: [{ path: "/x/codex", reason: { kind: "timedOut" } }],
      },
    };
    expect(fixes(broken)[0]).toEqual({
      problem: "Bezl could not identify this `codex`",
      says: "Timed out on --version",
      action: "Remove it from your path, or point Bezl at the real one.",
    });
  });

  test("a missing Claude Code says what to install", () => {
    const missing: ProviderCheck = {
      ...claudeFound,
      discovery: { provider: "claude", found: null, rejected: [] },
      signin: { kind: "noBinary" },
      readOnly: { kind: "noBinary" },
    };
    expect(fixes(missing)).toEqual([
      {
        problem: "No Claude Code on your path",
        action: "Install it: `curl -fsSL https://claude.ai/install.sh | bash`",
      },
    ]);
  });

  test("signed-out Claude runs claude, then /login", () => {
    expect(fixes(claudeSignedOut)).toEqual([
      {
        problem: "Claude Code is signed out",
        says: "Not logged in · Please run /login",
        action: "Run `claude`, then `/login`.",
      },
    ]);
  });

  test("workers alone signed out: signed in for you, not for workers", () => {
    expect(fixes(codexWith(signedIn, signedOut))).toEqual([
      {
        problem: "Codex is signed in for you, not for workers",
        action: `Run \`CODEX_HOME=${quotedWorkers} codex login\`.`,
      },
    ]);
  });

  test("both homes signed out name a command each", () => {
    expect(fixes(codexWith(signedOut, signedOut))).toEqual([
      { problem: "Codex is signed out for you", action: "Run `codex login`." },
      {
        problem: "Codex is signed out for workers",
        action: `Run \`CODEX_HOME=${quotedWorkers} codex login\`.`,
      },
    ]);
  });

  test("a missing workers' home is made first, since Codex refuses one that does not exist", () => {
    expect(fixes(codexWith(signedIn, { kind: "homeMissing" }))).toEqual([
      {
        problem: "Codex is signed in for you, not for workers",
        action: `Run \`mkdir -p ${quotedWorkers} && CODEX_HOME=${quotedWorkers} codex login\`.`,
      },
    ]);
  });

  test("an unrecognized status names the command that shows it", () => {
    const odd: CodexSignIn = { kind: "unrecognized", detail: { code: 1, says: "huh" } };
    expect(fixes(codexWith(signedIn, odd))).toEqual([
      {
        problem: "Workers' Codex home: sign-in status not recognized",
        says: "huh",
        action: `Run \`CODEX_HOME=${quotedWorkers} codex login status\` to see it.`,
      },
    ]);
  });

  test("a probe that could not run says so and is rerun by Check again", () => {
    const check: ProviderCheck = {
      ...claudeFound,
      readOnly: { kind: "couldNotRun", detail: { says: "no result event" } },
    };
    expect(fixes(check)).toEqual([
      {
        problem: "The read-only probe could not run",
        says: "no result event",
        action: "Check again to probe it again.",
      },
    ]);
  });
});

describe("capabilityRows", () => {
  test("merges each capability's enforcement with its probe result", () => {
    expect(capabilityRows(codexProbed)).toEqual([
      {
        capability: "fileWrites",
        label: "File writes",
        enforcement: "Blocked by `--sandbox read-only`",
        outcome: { label: "Passed", tone: "success", icon: "finished" },
      },
      {
        capability: "shell",
        label: "Shell",
        enforcement: "Blocked by `--sandbox read-only`",
        outcome: { label: "Passed", tone: "success", icon: "finished" },
      },
      {
        capability: "mcpTools",
        label: "MCP tools",
        enforcement: "Instruction only",
        outcome: { label: "Failed", tone: "blocked", icon: "blocked" },
        note: "an MCP server from the Codex config wrote its marker",
      },
      {
        capability: "hooks",
        label: "Hooks",
        enforcement: "Instruction only",
        outcome: { label: "Not probed", tone: "neutral", icon: "idle" },
        note: "Codex runs only hooks trusted in its home; not probed",
      },
      {
        capability: "network",
        label: "Network",
        enforcement: "Blocked by `--sandbox read-only`",
        outcome: { label: "Passed", tone: "success", icon: "finished" },
      },
    ]);
  });

  test("an unprobed CLI still shows how each capability is enforced", () => {
    const rows = capabilityRows(codexFound);
    expect(rows.map((r) => r.outcome)).toEqual([null, null, null, null, null]);
    expect(rows[2]).toEqual({
      capability: "mcpTools",
      label: "MCP tools",
      enforcement: "Instruction only",
      outcome: null,
    });
  });
});

describe("readOnlyShown", () => {
  const on = (s: number) =>
    new Date(s * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  test("a failed capability makes the reviewer not read-only", () => {
    expect(readOnlyShown(codexProbed)).toEqual({
      shown: { label: "Not read-only", tone: "blocked", icon: "blocked" },
      detail: `Probed 0.163.0 on ${on(1793313000)}`,
    });
  });

  test("all five passed is read-only", () => {
    expect(readOnlyShown(claudeFound)).toEqual({
      shown: { label: "All five passed", tone: "success", icon: "finished" },
      detail: `Probed 2.1.312 on ${on(1793312545)}`,
    });
  });

  test("passed and unprobed, none failed, is partly probed", () => {
    if (codexProbed.readOnly.kind !== "probed") throw new Error("fixture not probed");
    const { detail } = codexProbed.readOnly;
    const partly: ProviderCheck = {
      ...codexProbed,
      readOnly: {
        kind: "probed",
        detail: {
          ...detail,
          capabilities: { ...detail.capabilities, mcpTools: { kind: "passed" } },
        },
      },
    };
    expect(readOnlyShown(partly)).toEqual({
      shown: { label: "Partly probed", tone: "neutral", icon: "idle" },
      detail: `Probed 0.163.0 on ${on(1793313000)}`,
    });
  });

  test("an unprobed reviewer says why", () => {
    expect(readOnlyShown(codexFound)).toEqual({
      shown: { label: "Not probed: needs sign-in", tone: "warning", icon: "blocked" },
    });
    expect(
      readOnlyShown({ ...claudeFound, readOnly: { kind: "couldNotRun", detail: { says: "x" } } }),
    ).toEqual({ shown: { label: "Could not run", tone: "blocked", icon: "blocked" } });
    expect(readOnlyShown(thisMachine[1] as ProviderCheck)).toBeNull();
  });
});
