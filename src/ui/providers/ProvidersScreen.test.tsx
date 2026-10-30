import { invoke } from "@tauri-apps/api/core";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { claudeFound, codexProbed, noWriter } from "./fixtures";
import type { ProviderCheck } from "./model";
import { ProvidersScreen } from "./ProvidersScreen";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const preflight = vi.mocked(invoke);

/** A preflight run the test finishes by hand. */
function pending() {
  let finish!: (checks: ProviderCheck[]) => void;
  let fail!: (e: unknown) => void;
  const run = new Promise<ProviderCheck[]>((res, rej) => {
    finish = res;
    fail = rej;
  });
  preflight.mockReturnValueOnce(run);
  return { finish: (c: ProviderCheck[]) => act(async () => finish(c)), fail };
}

afterEach(() => preflight.mockReset());

describe("ProvidersScreen", () => {
  test("Check again reruns preflight, keeps old results while checking, then shows the new", async () => {
    const first = pending();
    render(<ProvidersScreen />);
    await first.finish(noWriter);
    expect(screen.getByText("No writer available")).toBeVisible();

    const again = pending();
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(preflight).toHaveBeenCalledTimes(2);
    expect(preflight).toHaveBeenLastCalledWith("providers_preflight");
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
    expect(preflight).toHaveBeenCalledTimes(2);
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
});
