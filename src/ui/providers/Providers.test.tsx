import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { claudeFound, claudeLimited, codexFound, thisMachine } from "./fixtures";
import type { ClaudeSignIn, ProviderCheck } from "./model";
import { Providers } from "./Providers";

describe("Providers", () => {
  test("shows a found CLI's path, version and the model that answered its canary", () => {
    render(<Providers checks={thisMachine} />);
    const claude = screen.getByRole("region", { name: "Claude Code" });
    expect(within(claude).getByText("Found")).toBeVisible();
    expect(within(claude).getByText("/Users/me/.local/bin/claude")).toBeVisible();
    expect(within(claude).getByText("2.1.312")).toBeVisible();
    const signin = within(claude).getByRole("list", { name: "Sign-in" });
    const status = within(signin).getByText("Signed in, claude-haiku-5-5 answered");
    expect(status.closest(".kb-status")).toHaveAttribute("data-tone", "success");
  });

  test("shows each Claude canary result with its own label and tone", () => {
    const claudeWith = (canary: ClaudeSignIn): ProviderCheck => ({
      ...claudeFound,
      signin: { kind: "canary", detail: canary },
    });
    const cases: [ClaudeSignIn, string, string][] = [
      [
        { kind: "signedOut", detail: { says: "Not logged in · Please run /login" } },
        'Signed out: "Not logged in · Please run /login"',
        "warning",
      ],
      [{ kind: "outOfQuota", detail: { says: "limit" } }, 'Out of quota: "limit"', "warning"],
      [{ kind: "unrecognized", detail: { code: 1, says: "?" } }, 'Unrecognized: "?"', "warning"],
      [{ kind: "failed", detail: { kind: "timedOut" } }, "Timed out", "blocked"],
    ];
    for (const [canary, label, tone] of cases) {
      const { unmount } = render(<Providers checks={[claudeWith(canary)]} />);
      const signin = screen.getByRole("list", { name: "Sign-in" });
      expect(within(signin).getByText(label).closest(".kb-status")).toHaveAttribute(
        "data-tone",
        tone,
      );
      unmount();
    }
  });

  test("keeps one heading outline: screen, provider, rejected", () => {
    render(<Providers checks={[codexFound]} />);
    expect(screen.getByRole("heading", { level: 1, name: "Providers" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Codex" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Rejected" })).toBeVisible();
  });

  test("shows a rejected binary with what its version output says", () => {
    render(<Providers checks={thisMachine} />);
    const codex = screen.getByRole("region", { name: "Codex" });
    expect(within(codex).getByText("Not found")).toBeVisible();
    const rejected = within(codex).getByRole("list", { name: "Rejected binaries" });
    const item = within(rejected).getByRole("listitem");
    expect(within(item).getByText("/Users/me/.bun/bin/codex")).toBeVisible();
    expect(item).toHaveTextContent('Says "0.2.3"');
    expect(within(codex).queryByRole("list", { name: "Sign-in" })).toBeNull();
  });

  test("shows Codex sign-in for each home", () => {
    render(<Providers checks={[codexFound]} />);
    const signin = screen.getByRole("list", { name: "Sign-in" });
    const items = within(signin).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const [operator, workers] = items as [HTMLElement, HTMLElement];
    expect(operator).toHaveTextContent("Your Codex home");
    expect(operator).toHaveTextContent("/Users/me/.codex");
    expect(within(operator).getByText("Signed in with ChatGPT")).toBeVisible();
    expect(workers).toHaveTextContent("Workers' Codex home");
    expect(within(workers).getByText("Signed out")).toBeVisible();
  });

  test("says why each rejected binary was rejected", () => {
    render(<Providers checks={[codexFound]} />);
    const items = within(screen.getByRole("list", { name: "Rejected binaries" })).getAllByRole(
      "listitem",
    );
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining('Says "0.2.3"'),
      expect.stringContaining('Exited with code 2: "boom"'),
    ]);
  });

  test("shows the canary's tokens, and limits as unknown when Claude reports none", () => {
    render(<Providers checks={[claudeFound]} />);
    const usage = screen.getByRole("list", { name: "Usage" });
    const [tokens, limits] = within(usage).getAllByRole("listitem") as [HTMLElement, HTMLElement];
    expect(tokens).toHaveTextContent("Canary tokens");
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
    const windows = within(screen.getByRole("list", { name: "Limit windows" })).getAllByRole(
      "listitem",
    );
    expect(windows.map((w) => w.textContent)).toEqual([
      `five hour: 43% used, resets ${resets(1793299200)}`,
      `seven day: 100% used, reached, resets ${resets(1793343600)}`,
    ]);
    const hit = screen.getByText('Limit hit: "You\'ve hit your limit · resets 5pm"');
    expect(hit.closest(".kb-status")).toHaveAttribute("data-tone", "warning");
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
    const windows = within(screen.getByRole("list", { name: "Limit windows" })).getAllByRole(
      "listitem",
    );
    expect(windows.map((w) => w.textContent)).toEqual(["7-day: 65% used", "5-hour: 65% used"]);
  });

  test("shows no usage for a CLI that was not found", () => {
    render(<Providers checks={thisMachine} />);
    const codex = screen.getByRole("region", { name: "Codex" });
    expect(within(codex).queryByRole("list", { name: "Usage" })).toBeNull();
  });

  test("shows a failed preflight as an error, and a pending one as checking", () => {
    const { rerender } = render(<Providers checks={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking agent CLIs…");
    rerender(<Providers checks={null} error="spawn failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("spawn failed");
  });
});
