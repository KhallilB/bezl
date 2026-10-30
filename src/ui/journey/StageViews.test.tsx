import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { keptTasks, tasks } from "./fixtures";
import type { JourneyTask, StageId } from "./model";
import { TaskPage } from "./TaskPage";

function open(list: JourneyTask[], id: string, stage: StageId) {
  const task = list.find((t) => t.id === id);
  if (!task) throw new Error(`no fixture ${id}`);
  const onKeep = vi.fn();
  render(<TaskPage task={task} stage={stage} onStage={vi.fn()} onKeep={onKeep} />);
  return { onKeep };
}

const take = (name: RegExp) => screen.getByRole("article", { name });

describe("Build", () => {
  test("each take shows its model, state and one activity line", () => {
    open(tasks, "debounce", "build");
    const a = take(/Take A, Claude Code/);
    expect(within(a).getByText("Writing")).toBeVisible();
    expect(within(a).getByText("Editing src/ui/terminals/xterm.ts")).toBeVisible();
  });

  test("a message steers the writer, which reads it at its next step", async () => {
    open(tasks, "debounce", "build");
    const box = screen.getByRole("textbox", { name: "Steer Claude Code" });
    await userEvent.type(box, "Keep the trailing resize");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText(/Claude Code reads it at its next step/)).toBeVisible();
    expect(box).toHaveValue("");
  });
});

describe("Check", () => {
  test("problems come first, one open at a time with its evidence", async () => {
    open(tasks, "snapshot", "check");
    const problems = within(screen.getByRole("list", { name: "Problems" })).getAllByRole("button", {
      expanded: false,
    });
    const first = screen.getByRole("button", { name: /Cursor lands one row low/ });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/received row 13/)).toBeVisible();
    expect(problems).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /restoreSnapshot runs in no test/ }));
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/received row 13/)).toBeNull();
    expect(screen.getByText(/No test reaches it/)).toBeVisible();
  });

  test("a problem goes to the writer with its evidence", async () => {
    open(tasks, "snapshot", "check");
    await userEvent.click(screen.getByRole("button", { name: "Send to Codex" }));
    expect(screen.getByText(/Sent to Codex/)).toBeVisible();
  });

  test("passed checks stay folded until asked for", async () => {
    open(tasks, "snapshot", "check");
    const passed = screen.getByText("cargo test -p bezl-domain");
    expect(passed).not.toBeVisible();
    await userEvent.click(screen.getByText(/checks that passed/));
    expect(passed).toBeVisible();
  });
});

describe("Review", () => {
  test("takes sit side by side, each with the other provider's verdict", () => {
    open(tasks, "empty-state", "review");
    expect(within(take(/Take A, Claude Code/)).getByText(/Clear, reuses EmptyState/)).toBeVisible();
    expect(within(take(/Take A, Claude Code/)).getByText("Codex:")).toBeVisible();
    expect(within(take(/Take B, Codex/)).getByText("Claude Code:")).toBeVisible();
  });

  test("keeping a take hands it to Ship", async () => {
    const { onKeep } = open(tasks, "empty-state", "review");
    await userEvent.click(screen.getByRole("button", { name: "Keep take A" }));
    expect(onKeep).toHaveBeenCalledWith("A");
  });
});

describe("Ship", () => {
  test("the pull request with what changed and how it got here", async () => {
    open(keptTasks, "empty-state", "ship");
    expect(
      screen.getByRole("heading", { name: "Add an empty state to the Projects page" }),
    ).toBeVisible();
    const changed = screen.getByRole("list", { name: "What changed" });
    expect(within(changed).getByText("src/pages/Projects.tsx")).toBeVisible();
    expect(within(changed).getByText("+31 −4")).toBeVisible();
    expect(
      within(screen.getByRole("list", { name: /How it got here/ })).getByText("Review"),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Open pull request" }));
    expect(screen.getByText(/Opened pull request #42/)).toBeVisible();
  });
});
