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
  rejectionText,
  tierRows,
  tiersShown,
  windowText,
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
        problem: "This `codex` isn't Codex",
        says: 'It printed "0.2.3" when Bezl asked for its version',
        action: "Remove it, or show Bezl where the real one is.",
      },
      {
        problem: "Codex isn't installed on this computer",
        action: "Install it with `npm install -g @openai/codex`",
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
      problem: "Bezl couldn't tell what this `codex` is",
      says: "It didn't answer when Bezl asked for its version",
      action: "Remove it, or show Bezl where the real one is.",
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
        problem: "Claude Code isn't installed on this computer",
        action: "Install it with `curl -fsSL https://claude.ai/install.sh | bash`",
      },
    ]);
  });

  test("signed-out Claude runs claude, then /login", () => {
    expect(fixes(claudeSignedOut)).toEqual([
      {
        problem: "Claude Code is signed out",
        says: 'Claude Code said "Not logged in · Please run /login"',
        action: "Run `claude`, then type `/login`.",
      },
    ]);
  });

  test("workers alone signed out: signed in for you, not for workers", () => {
    expect(fixes(codexWith(signedIn, signedOut))).toEqual([
      {
        problem: "Codex is signed in for you, not for Bezl's agents",
        action: `Run \`CODEX_HOME=${quotedWorkers} codex login\`.`,
      },
    ]);
  });

  test("both homes signed out name a command each", () => {
    expect(fixes(codexWith(signedOut, signedOut))).toEqual([
      { problem: "Codex is signed out for you", action: "Run `codex login`." },
      {
        problem: "Codex is signed out for Bezl's agents",
        action: `Run \`CODEX_HOME=${quotedWorkers} codex login\`.`,
      },
    ]);
  });

  test("a missing workers' home is made first, since Codex refuses one that does not exist", () => {
    expect(fixes(codexWith(signedIn, { kind: "homeMissing" }))).toEqual([
      {
        problem: "Codex is signed in for you, not for Bezl's agents",
        action: `Run \`mkdir -p ${quotedWorkers} && CODEX_HOME=${quotedWorkers} codex login\`.`,
      },
    ]);
  });

  test("an unrecognized status names the command that shows it", () => {
    const odd: CodexSignIn = { kind: "unrecognized", detail: { code: 1, says: "huh" } };
    expect(fixes(codexWith(signedIn, odd))).toEqual([
      {
        problem: "Bezl didn't understand the sign-in status for Codex for Bezl's agents",
        says: 'Codex said "huh"',
        action: `Run \`CODEX_HOME=${quotedWorkers} codex login status\` to see what it says.`,
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
        problem: "The safety tests couldn't run",
        says: 'The error was "no result event"',
        action: "Select Check again to retry them.",
      },
    ]);
  });
});

describe("tier probe fixes", () => {
  test("a tier probe that could not run says so and is rerun by Check again", () => {
    const check: ProviderCheck = {
      ...claudeFound,
      tiers: { kind: "couldNotRun", detail: { says: "timed out" } },
    };
    expect(fixes(check)).toEqual([
      {
        problem: "The tests for working alongside other tasks couldn't run",
        says: 'The error was "timed out"',
        action: "Select Check again to retry them.",
      },
    ]);
  });
});

describe("capabilityRows", () => {
  test("merges each capability's enforcement with its probe result", () => {
    expect(capabilityRows(codexProbed)).toEqual([
      {
        capability: "fileWrites",
        label: "Writing files",
        enforcement: "Turned off with `--sandbox read-only`",
        outcome: { label: "Passed", tone: "success", icon: "finished" },
      },
      {
        capability: "shell",
        label: "Running commands",
        enforcement: "Turned off with `--sandbox read-only`",
        outcome: { label: "Passed", tone: "success", icon: "finished" },
      },
      {
        capability: "mcpTools",
        label: "MCP tools",
        enforcement: "Asked, not enforced",
        outcome: { label: "Failed", tone: "blocked", icon: "blocked" },
        note: "an MCP server from the Codex config wrote its marker",
      },
      {
        capability: "hooks",
        label: "Hooks",
        enforcement: "Asked, not enforced",
        outcome: { label: "Not tested", tone: "neutral", icon: "idle" },
        note: "Codex runs only hooks trusted in its home; not probed",
      },
      {
        capability: "network",
        label: "Internet access",
        enforcement: "Turned off with `--sandbox read-only`",
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
      enforcement: "Asked, not enforced",
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
      shown: { label: "A safety test failed", tone: "blocked", icon: "blocked" },
      detail: `Tested version 0.163.0 on ${on(1793313000)}`,
    });
  });

  test("all five passed is read-only", () => {
    expect(readOnlyShown(claudeFound)).toEqual({
      shown: { label: "All 5 safety tests passed", tone: "success", icon: "finished" },
      detail: `Tested version 2.1.312 on ${on(1793312545)}`,
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
      shown: { label: "Some weren't tested", tone: "neutral", icon: "idle" },
      detail: `Tested version 0.163.0 on ${on(1793313000)}`,
    });
  });

  test("an unprobed reviewer says why", () => {
    expect(readOnlyShown(codexFound)).toEqual({
      shown: { label: "Sign in to test", tone: "warning", icon: "blocked" },
    });
    expect(
      readOnlyShown({ ...claudeFound, readOnly: { kind: "couldNotRun", detail: { says: "x" } } }),
    ).toEqual({ shown: { label: "Couldn't run", tone: "blocked", icon: "blocked" } });
    expect(readOnlyShown(thisMachine[1] as ProviderCheck)).toBeNull();
  });
});

describe("tierRows", () => {
  test("names each tier and shows its result in the probe's words", () => {
    expect(tierRows(codexProbed)).toEqual([
      {
        tier: "stepBoundary",
        label: "Gets updates between steps",
        outcome: { label: "Works", tone: "success", icon: "finished" },
        note: "one exec call ran one turn and ended with turn.completed",
      },
      {
        tier: "mcpTool",
        label: "Can use Bezl's MCP tool",
        outcome: { label: "Works", tone: "success", icon: "finished" },
        note: "exec --json has no init tool list; the agent called bezl's batch_state",
      },
      {
        tier: "liveInput",
        label: "Gets messages mid-step",
        outcome: { label: "Doesn't work", tone: "neutral", icon: "idle" },
        note: "codex queue took the input mid-step, but the step ended without it",
      },
    ]);
  });

  test("an unknown tier shows why, never a pass", () => {
    const check: ProviderCheck = {
      ...codexProbed,
      tiers: {
        kind: "probed",
        detail: {
          ...(codexProbed.tiers.kind === "probed" ? codexProbed.tiers.detail : ({} as never)),
          tiers: {
            stepBoundary: { kind: "holds", detail: { evidence: "ran" } },
            mcpTool: { kind: "unknown", detail: { why: "no call" } },
            liveInput: { kind: "unknown", detail: { why: "no push" } },
          },
        },
      },
    };
    expect(tierRows(check).map((r) => [r.outcome?.label, r.note])).toEqual([
      ["Works", "ran"],
      ["Unknown", "no call"],
      ["Unknown", "no push"],
    ]);
  });

  test("an unprobed CLI has no tier rows", () => {
    expect(tierRows(codexFound)).toEqual([]);
  });
});

describe("tiersShown", () => {
  const on = (s: number) =>
    new Date(s * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  test("counts the tiers that hold", () => {
    expect(tiersShown(claudeFound)).toEqual({
      shown: { label: "All 3 work", tone: "success", icon: "finished" },
      detail: `Tested version 2.1.312 on ${on(1793344492)}`,
    });
    expect(tiersShown(codexProbed)).toEqual({
      shown: { label: "2 of 3 work", tone: "neutral", icon: "idle" },
      detail: `Tested version 0.163.0 on ${on(1793344492)}`,
    });
  });

  test("an unprobed CLI says why", () => {
    expect(tiersShown(codexFound)).toEqual({
      shown: { label: "Sign in to test", tone: "warning", icon: "blocked" },
    });
    expect(
      tiersShown({ ...claudeFound, tiers: { kind: "couldNotRun", detail: { says: "x" } } }),
    ).toEqual({ shown: { label: "Couldn't run", tone: "blocked", icon: "blocked" } });
    expect(tiersShown(thisMachine[1] as ProviderCheck)).toBeNull();
  });
});

describe("plain sentences for edge cases", () => {
  test("a usage window with no reported use says Bezl can't tell", () => {
    expect(
      windowText({
        name: "weekly",
        minutes: null,
        usedPercent: null,
        resetsAt: null,
        reached: null,
      }),
    ).toBe("Bezl can't tell how much of your weekly limit you've used.");
  });

  test("a program that stopped with no error code still quotes what it said", () => {
    expect(rejectionText({ kind: "exited", detail: { code: null, says: "boom" } })).toBe(
      'It stopped without an error code and said "boom"',
    );
  });
});
