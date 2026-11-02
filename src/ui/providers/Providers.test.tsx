import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  claudeFound,
  claudeLimited,
  claudeSignedOut,
  codexFound,
  codexProbed,
  noWriter,
  thisMachine,
} from "./fixtures";
import type { ClaudeSignIn, ProviderCheck } from "./model";
import { Providers } from "./Providers";

describe("Providers", () => {
  test("shows an installed agent's path, version and the model that answered its test message", () => {
    render(<Providers checks={thisMachine} />);
    const claude = screen.getByRole("region", { name: "Claude Code" });
    expect(within(claude).getByText("Installed")).toBeVisible();
    expect(within(claude).getByText("/Users/me/.local/bin/claude")).toBeVisible();
    expect(within(claude).getByText("2.1.312")).toBeVisible();
    const signin = within(claude).getByRole("list", { name: "Sign-in" });
    const status = within(signin).getByText("Signed in. claude-haiku-5-5 answered a test message");
    expect(status.closest(".kb-status")).toHaveAttribute("data-tone", "success");
  });

  test("marks a found version without contract captures as Untested version", () => {
    const unpinned: ProviderCheck = {
      ...codexFound,
      discovery: {
        ...codexFound.discovery,
        found: { path: "/opt/codex/bin/codex", version: "0.199.0" },
      },
      pinned: false,
    };
    render(<Providers checks={[claudeFound, unpinned]} />);
    const codex = screen.getByRole("region", { name: "Codex" });
    const untested = within(codex).getByText("Untested version");
    expect(untested).toBeVisible();
    expect(untested).toHaveAttribute("data-tone", "warning");
    const claude = screen.getByRole("region", { name: "Claude Code" });
    expect(within(claude).queryByText("Untested version")).toBeNull();
  });

  test("shows each Claude test message result with its own label and tone", () => {
    const claudeWith = (canary: ClaudeSignIn): ProviderCheck => ({
      ...claudeFound,
      signin: { kind: "canary", detail: canary },
    });
    // Chip stays short; the reply, quoted exactly, shows under To fix.
    const cases: [ClaudeSignIn, string, string, string | null][] = [
      [
        { kind: "signedOut", detail: { says: "Not logged in · Please run /login" } },
        "Signed out",
        "warning",
        'Claude Code said "Not logged in · Please run /login"',
      ],
      [
        { kind: "outOfQuota", detail: { says: "limit" } },
        "Usage limit reached",
        "warning",
        'Claude Code said "limit"',
      ],
      [
        { kind: "unrecognized", detail: { code: 1, says: "?" } },
        "Unexpected reply",
        "warning",
        'Claude Code said "?"',
      ],
      [{ kind: "failed", detail: { kind: "timedOut" } }, "Timed out", "blocked", null],
    ];
    for (const [canary, label, tone, says] of cases) {
      const { unmount } = render(<Providers checks={[claudeWith(canary)]} />);
      const signin = screen.getByRole("list", { name: "Sign-in" });
      expect(within(signin).getByText(label).closest(".kb-status")).toHaveAttribute(
        "data-tone",
        tone,
      );
      if (says) expect(screen.getByRole("list", { name: "To fix" })).toHaveTextContent(says);
      unmount();
    }
  });

  test("keeps one heading outline: screen, provider, rejected", () => {
    render(<Providers checks={[codexFound]} />);
    expect(screen.getByRole("heading", { level: 1, name: "Coding agents" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Codex" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Rejected" })).toBeVisible();
  });

  test("shows a rejected binary with what it printed for its version", () => {
    render(<Providers checks={thisMachine} />);
    const codex = screen.getByRole("region", { name: "Codex" });
    expect(within(codex).getByText("Not installed")).toBeVisible();
    const rejected = within(codex).getByRole("list", { name: "Rejected binaries" });
    const item = within(rejected).getByRole("listitem");
    expect(within(item).getByText("/Users/me/.bun/bin/codex")).toBeVisible();
    expect(item).toHaveTextContent('It printed "0.2.3" when Bezl asked for its version');
    expect(within(codex).queryByRole("list", { name: "Sign-in" })).toBeNull();
  });

  test("shows Codex sign-in for each home", () => {
    render(<Providers checks={[codexFound]} />);
    const signin = screen.getByRole("list", { name: "Sign-in" });
    const items = within(signin).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const [operator, workers] = items as [HTMLElement, HTMLElement];
    expect(operator).toHaveTextContent("Codex for you");
    expect(operator).toHaveTextContent("/Users/me/.codex");
    expect(within(operator).getByText("Signed in with ChatGPT")).toBeVisible();
    expect(workers).toHaveTextContent("Codex for Bezl's agents");
    expect(within(workers).getByText("Signed out")).toBeVisible();
  });

  test("says why each rejected binary was rejected", () => {
    render(<Providers checks={[codexFound]} />);
    const items = within(screen.getByRole("list", { name: "Rejected binaries" })).getAllByRole(
      "listitem",
    );
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining('It printed "0.2.3" when Bezl asked for its version'),
      expect.stringContaining('It stopped with error code 2 and said "boom"'),
    ]);
  });

  test("shows the test message's tokens, and limits as unknown when Claude reports none", () => {
    render(<Providers checks={[claudeFound]} />);
    const usage = screen.getByRole("list", { name: "Usage" });
    const [tokens, limits] = within(usage).getAllByRole("listitem") as [HTMLElement, HTMLElement];
    expect(tokens).toHaveTextContent("Test message tokens");
    expect(tokens).toHaveTextContent("2 in · 4 out · 0 cache read · 29,763 cache write");
    expect(limits).toHaveTextContent(/^Limits\s*unknown$/);
  });

  test("says unknown for usage a CLI does not report", () => {
    render(<Providers checks={[codexFound]} />);
    const items = within(screen.getByRole("list", { name: "Usage" })).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual(["Tokensunknown", "Limitsunknown"]);
  });

  test("shows each limit window and a limit hit in the CLI's own words", () => {
    render(<Providers checks={[claudeLimited]} />);
    const resets = (s: number) =>
      new Date(s * 1000).toLocaleString("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      });
    const windows = within(screen.getByRole("list", { name: "Usage limits" })).getAllByRole(
      "listitem",
    );
    expect(windows.map((w) => w.textContent)).toEqual([
      `You've used 43% of your five-hour limit. It resets ${resets(1793299200)}.`,
      `You've reached your seven-day limit. It resets ${resets(1793343600)}.`,
    ]);
    const hit = screen.getByText("Usage limit reached");
    expect(hit.closest(".kb-status")).toHaveAttribute("data-tone", "warning");
    expect(
      screen.getByText('Claude Code said "You\'ve hit your limit · resets 5pm"'),
    ).toBeVisible();
  });

  test("names a Codex window by its length", () => {
    const window = { name: "primary", usedPercent: 65, resetsAt: null, reached: null };
    const codexLimits: ProviderCheck = {
      ...codexFound,
      usage: {
        tokens: { kind: "unknown" },
        limits: {
          kind: "reported",
          detail: {
            windows: [
              { ...window, minutes: 10080 },
              { ...window, minutes: 300 },
            ],
            hit: null,
          },
        },
      },
    };
    render(<Providers checks={[codexLimits]} />);
    const windows = within(screen.getByRole("list", { name: "Usage limits" })).getAllByRole(
      "listitem",
    );
    expect(windows.map((w) => w.textContent)).toEqual([
      "You've used 65% of your 7-day limit.",
      "You've used 65% of your 5-hour limit.",
    ]);
  });

  test("shows no usage for a CLI that was not found", () => {
    render(<Providers checks={thisMachine} />);
    const codex = screen.getByRole("region", { name: "Codex" });
    expect(within(codex).queryByRole("list", { name: "Usage" })).toBeNull();
  });

  test("shows a failed preflight as an error, and a pending one as checking", () => {
    const { rerender } = render(<Providers checks={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking your coding agents…");
    rerender(<Providers checks={null} error="spawn failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("spawn failed");
  });

  test("lists each capability with how it is turned off and its safety test, failures in the test's words", () => {
    render(<Providers checks={[codexProbed]} />);
    const codex = screen.getByRole("region", { name: "Codex" });
    expect(within(codex).getByText("A safety test failed")).toBeVisible();
    expect(codex).toHaveTextContent(/Tested version 0\.163\.0 on /);
    const rows = within(within(codex).getByRole("list", { name: "Safety tests" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(5);
    const mcp = rows[2] as HTMLElement;
    expect(mcp).toHaveTextContent("MCP tools");
    expect(mcp).toHaveTextContent("Asked, not enforced");
    expect(mcp).toHaveTextContent("an MCP server from the Codex config wrote its marker");
    expect(within(mcp).getByText("Failed").closest(".kb-status")).toHaveAttribute(
      "data-tone",
      "blocked",
    );
    expect(rows[0]).toHaveTextContent("Turned off with --sandbox read-only");
    expect(within(rows[0] as HTMLElement).getByText("--sandbox read-only").tagName).toBe("CODE");
  });

  test("lists each working-alongside test with its result, a missing one in the test's words", () => {
    render(<Providers checks={[codexProbed]} />);
    const codex = screen.getByRole("region", { name: "Codex" });
    const section = within(codex).getByRole("heading", { name: "Working alongside other tasks" })
      .parentElement?.parentElement as HTMLElement;
    expect(section).toHaveTextContent("2 of 3 work");
    expect(section).toHaveTextContent("Bezl doesn't use this yet.");
    const rows = within(
      within(codex).getByRole("list", { name: "What works alongside other tasks" }),
    ).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    const live = rows[2] as HTMLElement;
    expect(live).toHaveTextContent("Gets messages mid-step");
    expect(live).toHaveTextContent(
      "codex queue took the input mid-step, but the step ended without it",
    );
    expect(within(live).getByText("Doesn't work").closest(".kb-status")).toHaveAttribute(
      "data-tone",
      "neutral",
    );
  });

  test("shows no tiers for a CLI not found", () => {
    render(<Providers checks={[thisMachine[1] as ProviderCheck]} />);
    expect(screen.queryByRole("heading", { name: "Working alongside other tasks" })).toBeNull();
  });

  test("shows enforcement before a probe, and nothing for a CLI not found", () => {
    render(<Providers checks={[codexFound, thisMachine[1] as ProviderCheck]} />);
    const [found, missing] = screen.getAllByRole("region") as [HTMLElement, HTMLElement];
    // Read-only and tiers both wait on sign-in.
    expect(within(found).getAllByText("Sign in to test")).toHaveLength(2);
    expect(within(found).getByRole("list", { name: "Safety tests" })).toHaveTextContent(
      "Asked, not enforced",
    );
    expect(within(missing).queryByRole("list", { name: "Safety tests" })).toBeNull();
  });

  test("names the command for every failing check", () => {
    render(<Providers checks={noWriter} />);
    const claude = within(screen.getByRole("region", { name: "Claude Code" })).getByRole("list", {
      name: "To fix",
    });
    expect(claude).toHaveTextContent("Claude Code is signed out");
    expect(within(claude).getByText("claude").tagName).toBe("CODE");
    expect(within(claude).getByText("/login").tagName).toBe("CODE");
    const codex = within(screen.getByRole("region", { name: "Codex" })).getByRole("list", {
      name: "To fix",
    });
    const [impostor, install] = within(codex).getAllByRole("listitem") as [
      HTMLElement,
      HTMLElement,
    ];
    expect(impostor).toHaveTextContent("This codex isn't Codex");
    expect(impostor).toHaveTextContent('It printed "0.2.3" when Bezl asked for its version');
    expect(impostor).toHaveTextContent("Remove it, or show Bezl where the real one is.");
    expect(within(install).getByText("npm install -g @openai/codex").tagName).toBe("CODE");
  });

  test("a passing CLI has nothing to fix", () => {
    render(<Providers checks={[claudeFound]} />);
    expect(screen.queryByRole("list", { name: "To fix" })).toBeNull();
  });

  test("says no coding agent can write code yet, and offers no New task", () => {
    render(<Providers checks={noWriter} />);
    expect(screen.getByText("No coding agent can write code yet")).toBeVisible();
    expect(screen.queryByRole("button", { name: /new task/i })).toBeNull();
  });

  test("says which CLIs can write when one can", () => {
    const { rerender } = render(<Providers checks={[claudeSignedOut, codexProbed]} />);
    expect(screen.getByText("Codex is ready to write code")).toBeVisible();
    expect(screen.queryByText("No coding agent can write code yet")).toBeNull();
    rerender(<Providers checks={[claudeFound, codexProbed]} />);
    expect(screen.getByText("Claude Code and Codex are ready to write code")).toBeVisible();
  });

  test("Check again keeps the old results on screen while it runs", async () => {
    const onCheckAgain = vi.fn();
    const { rerender } = render(<Providers checks={noWriter} onCheckAgain={onCheckAgain} />);
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(onCheckAgain).toHaveBeenCalledOnce();
    rerender(<Providers checks={noWriter} checking onCheckAgain={onCheckAgain} />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking your coding agents…");
    expect(screen.getByRole("region", { name: "Codex" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Check again" })).toBeDisabled();
  });

  test("a failed rerun shows its error above the last results", () => {
    render(<Providers checks={noWriter} error="spawn failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("spawn failed");
    expect(screen.getByRole("region", { name: "Codex" })).toBeVisible();
  });
});

describe("Providers on first run", () => {
  const start = () => screen.queryByRole("button", { name: "Start your first task" });

  test("Agents is the current step, and a writer unlocks Start your first task", async () => {
    const onContinue = vi.fn();
    render(<Providers checks={[claudeFound, codexProbed]} firstRun onContinue={onContinue} />);
    const steps = screen.getByRole("list", { name: "Getting started" });
    expect(within(steps).getByText("Agents").closest("li")).toHaveAttribute("aria-current", "step");
    await userEvent.click(start() as HTMLElement);
    expect(onContinue).toHaveBeenCalledOnce();
  });

  test("with no writer the action stays, disabled, and says why", () => {
    render(<Providers checks={noWriter} firstRun onContinue={() => {}} />);
    expect(start()).toBeDisabled();
    expect(start()).toHaveAccessibleDescription(/No coding agent can write code yet/);
  });

  test("no action until preflight returns", () => {
    render(<Providers checks={null} checking firstRun onContinue={() => {}} />);
    expect(start()).toBeNull();
  });

  test("outside first run there are no steps and no action", () => {
    render(<Providers checks={[claudeFound, codexProbed]} />);
    expect(screen.queryByRole("list", { name: "Getting started" })).toBeNull();
    expect(start()).toBeNull();
  });
});
