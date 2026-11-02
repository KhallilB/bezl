import { invoke } from "@tauri-apps/api/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { claudeFound, codexProbed, githubSignedIn, githubSignedOut, noWriter } from "./fixtures";
import type { GitHubCheck, ProviderCheck } from "./model";
import { ProvidersScreen } from "./ProvidersScreen";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const preflight = vi.mocked(invoke);
const runs: Promise<ProviderCheck[]>[] = [];
let github: () => Promise<GitHubCheck> = async () => githubSignedIn;

beforeEach(() => {
  preflight.mockImplementation((cmd: string) =>
    cmd === "github_preflight" ? github() : (runs.shift() ?? new Promise(() => {})),
  );
});

/** A preflight run the test finishes by hand. */
function pending() {
  let finish!: (checks: ProviderCheck[]) => void;
  let fail!: (e: unknown) => void;
  const run = new Promise<ProviderCheck[]>((res, rej) => {
    finish = res;
    fail = rej;
  });
  runs.push(run);
  return { finish: (c: ProviderCheck[]) => act(async () => finish(c)), fail };
}

const calls = (cmd: string) => preflight.mock.calls.filter(([c]) => c === cmd).length;

afterEach(() => {
  preflight.mockReset();
  runs.length = 0;
  github = async () => githubSignedIn;
});

describe("ProvidersScreen", () => {
  test("Check again reruns preflight, keeps old results while checking, then shows the new", async () => {
    const first = pending();
    render(<ProvidersScreen />);
    await first.finish(noWriter);
    expect(screen.getByText("No writer available")).toBeVisible();

    const again = pending();
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(calls("providers_preflight")).toBe(2);
    expect(screen.getByRole("status")).toHaveTextContent("Checking agent CLIs…");
    expect(screen.getByText("No writer available")).toBeVisible();

    await again.finish([claudeFound, codexProbed]);
    expect(screen.getByText("Ready: Claude Code and Codex can write.")).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("a run in flight is never overlapped by another", async () => {
    const first = pending();
    render(<ProvidersScreen />);
    await first.finish(noWriter);
    pending();
    const button = screen.getByRole("button", { name: "Check again" });
    await userEvent.click(button);
    // A second click before the disabled state renders must not start a run either.
    await act(async () => button.click());
    expect(calls("providers_preflight")).toBe(2);
  });

  test("a failed rerun keeps the last results and says why", async () => {
    const first = pending();
    render(<ProvidersScreen />);
    await first.finish(noWriter);
    const again = pending();
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    await act(async () => again.fail("spawn failed"));
    expect(screen.getByRole("alert")).toHaveTextContent("spawn failed");
    expect(screen.getByText("No writer available")).toBeVisible();
    expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
  });

  test("checks GitHub sign-in beside the agent CLIs, and again on Check again", async () => {
    const first = pending();
    render(<ProvidersScreen />);
    await first.finish(noWriter);
    const row = screen.getByRole("region", { name: "GitHub" });
    expect(within(row).getByText("Signed in as octocat")).toBeVisible();

    github = async () => githubSignedOut;
    const again = pending();
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    await again.finish(noWriter);
    expect(calls("github_preflight")).toBe(2);
    expect(within(row).getByText("Not signed in")).toBeVisible();
  });

  test("the GitHub row shows before the slower agent CLI preflight returns", async () => {
    pending();
    render(<ProvidersScreen />);
    await act(async () => {});
    expect(
      within(screen.getByRole("region", { name: "GitHub" })).getByText("Signed in as octocat"),
    ).toBeVisible();
  });
});
