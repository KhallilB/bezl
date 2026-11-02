import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { keptTasks, shippedTasks, tasks } from "./fixtures";
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
const bar = () => screen.getByRole("region", { name: "Next step" });

describe("Next step", () => {
  test("every stage ends in the same bar", () => {
    for (const stage of ["define", "plan", "build", "check", "review", "ship"] as const) {
      open(tasks, "empty-state", stage);
      expect(bar(), stage).toBeVisible();
      cleanup();
    }
  });

  test("with nothing to decide, it says so", () => {
    open(tasks, "debounce", "build");
    expect(within(bar()).getByText("Nothing needs you at Build.")).toBeVisible();
    expect(within(bar()).queryByRole("button")).toBeNull();
  });
});

describe("Build", () => {
  test("each attempt shows its model, state and one activity line", () => {
    open(tasks, "debounce", "build");
    const a = take(/Attempt A, Claude Code/);
    expect(within(a).getByText("Writing")).toBeVisible();
    expect(within(a).getByText("Editing src/ui/terminals/xterm.ts")).toBeVisible();
  });

  test("a message reaches the writer, which reads it at its next step", async () => {
    open(tasks, "debounce", "build");
    const box = screen.getByRole("textbox", { name: "Message Claude Code" });
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

    await userEvent.click(screen.getByRole("button", { name: /No test covers restoreSnapshot/ }));
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/received row 13/)).toBeNull();
    expect(screen.getByText(/No test reaches it/)).toBeVisible();
  });

  test("every problem goes to the writer together, with its evidence", async () => {
    open(tasks, "snapshot", "check");
    expect(screen.getAllByRole("button", { name: /^Send/ })).toHaveLength(1);
    await userEvent.click(within(bar()).getByRole("button", { name: "Send 2 problems to Codex" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sent 2 problems to Codex with what Bezl saw.",
    );
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
  const table = () => screen.getByRole("table", { name: "Compare the attempts" });
  const row = (name: RegExp) => within(table()).getByRole("row", { name });

  test("attempts compare line by line, with each other agent's verdict", () => {
    open(tasks, "empty-state", "review");
    expect(within(table()).getByRole("columnheader", { name: /A · Claude Code/ })).toBeVisible();
    expect(within(table()).getByRole("columnheader", { name: /B · Codex/ })).toBeVisible();
    expect(
      within(row(/one clear way to create the first project/)).getByText(
        "The import link does nothing yet",
      ),
    ).toBeVisible();
    expect(
      within(row(/The other agent said/)).getByText(/Clear, and it reuses EmptyState/),
    ).toBeVisible();
    expect(within(row(/^Changed .*files/)).getByText("3 files · +86 −4")).toBeVisible();
  });

  test("only what differs hides the lines where both agree", async () => {
    open(tasks, "empty-state", "review");
    expect(row(/Existing tests still pass/)).toBeVisible();
    await userEvent.click(screen.getByRole("switch", { name: "Only what differs" }));
    expect(within(table()).queryByRole("row", { name: /Existing tests still pass/ })).toBeNull();
  });

  test("the next step carries Bezl's lean, and keeping hands it to Ship", async () => {
    const { onKeep } = open(tasks, "empty-state", "review");
    expect(within(bar()).getByText(/Bezl leans to A/)).toBeVisible();
    await userEvent.click(within(bar()).getByRole("button", { name: "Keep attempt A" }));
    expect(onKeep).toHaveBeenCalledWith("A");
  });

  test("either attempt can be kept from its column", async () => {
    const { onKeep } = open(tasks, "empty-state", "review");
    await userEvent.click(within(table()).getByRole("button", { name: "Keep B" }));
    expect(onKeep).toHaveBeenCalledWith("B");
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
    await userEvent.click(within(bar()).getByRole("button", { name: "Open pull request" }));
    expect(screen.getByText(/Opened pull request #42/)).toBeVisible();
  });

  test("once opened, Ship links the pull request and offers the next task", async () => {
    const task = keptTasks.find((t) => t.id === "empty-state");
    if (!task) throw new Error("no fixture empty-state");
    const onNewTask = vi.fn();
    render(<TaskPage task={task} stage="ship" onStage={vi.fn()} onNewTask={onNewTask} />);
    await userEvent.click(screen.getByRole("button", { name: "Open pull request" }));
    expect(screen.getByRole("link", { name: "View on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/acme/studio-web/pull/42",
    );
    expect(screen.queryByRole("button", { name: "Back to review" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "New task" }));
    expect(onNewTask).toHaveBeenCalledOnce();
  });

  test("once opened, Ship shows the pull request's checks as GitHub reports them", async () => {
    open(keptTasks, "empty-state", "ship");
    await userEvent.click(screen.getByRole("button", { name: "Open pull request" }));
    const checks = screen.getByRole("list", { name: "Checks on GitHub" });
    expect(within(checks).getByText("Browser tests")).toBeVisible();
    expect(within(checks).getByText("Running")).toBeVisible();
    expect(screen.getByText("2 of 3 checks have passed, and 1 is still running.")).toBeVisible();
  });

  test("a failing check links to its log and stops nothing", async () => {
    const task = keptTasks.find((t) => t.id === "empty-state");
    const ship = task?.views.ship.ship;
    if (!task || !ship) throw new Error("no fixture empty-state");
    const failing: JourneyTask = {
      ...task,
      views: {
        ...task.views,
        ship: {
          ...task.views.ship,
          ship: {
            ...ship,
            ci: {
              on: "pullRequest",
              checks: [{ name: "Browser tests", state: "failed", url: "https://ci.example/run/7" }],
            },
          },
        },
      },
    };
    const onNewTask = vi.fn();
    render(<TaskPage task={failing} stage="ship" onStage={vi.fn()} onNewTask={onNewTask} />);
    await userEvent.click(screen.getByRole("button", { name: "Open pull request" }));
    expect(screen.getByRole("link", { name: "View log for Browser tests" })).toHaveAttribute(
      "href",
      "https://ci.example/run/7",
    );
    expect(screen.getByRole("button", { name: "New task" })).toBeEnabled();
  });

  test("after the merge, Ship opens on the merged commit's checks", () => {
    open(shippedTasks.merged, "empty-state", "ship");
    expect(screen.queryByRole("button", { name: "Open pull request" })).toBeNull();
    expect(screen.getByRole("list", { name: "Checks on the merged commit" })).toBeVisible();
    expect(screen.getByText("All 3 checks passed on the merged commit 3f9c2ab.")).toBeVisible();
  });
});
