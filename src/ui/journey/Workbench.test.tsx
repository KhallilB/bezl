import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { needsYou } from "../approvals/fixtures";
import type { NeedsYouItem } from "../approvals/model";
import { tasks } from "./fixtures";
import type { StageId } from "./model";
import { TaskPage } from "./TaskPage";

function Harness({ id, stage, onQueue }: { id: string; stage: StageId; onQueue?: () => void }) {
  const task = tasks.find((t) => t.id === id);
  const [queue, setQueue] = useState<NeedsYouItem[]>(needsYou);
  if (!task) throw new Error(`no fixture ${id}`);
  return (
    <TaskPage
      task={task}
      stage={stage}
      onStage={vi.fn()}
      needsYou={queue}
      onNeedsYou={(items) => {
        setQueue(items);
        onQueue?.();
      }}
    />
  );
}

const side = () => screen.getByRole("tabpanel");

describe("context line", () => {
  test("keeps the goal, what changed and how much is proven in view", () => {
    render(<Harness id="empty-state" stage="review" />);
    const context = screen.getByRole("list", { name: "This task" });
    expect(
      within(context).getByRole("button", { name: /When someone has no projects/ }),
    ).toBeVisible();
    expect(within(context).getByText("4 files across 2 attempts")).toBeVisible();
    expect(within(context).getByRole("button", { name: "3 of 4 proven" })).toBeVisible();
  });

  test("the goal opens Intent: what's proven, what you decided and what was assumed", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByRole("button", { name: "3 of 4 proven" }));
    expect(screen.getByRole("tab", { name: "Intent" })).toHaveAttribute("aria-selected", "true");
    const done = within(side()).getByRole("list", { name: "Done when" });
    expect(within(done).getAllByRole("listitem")).toHaveLength(4);
    expect(within(done).getByText("You check in Review")).toBeVisible();
    expect(within(side()).getByRole("list", { name: "Decided" })).toBeVisible();
    expect(within(side()).getByRole("list", { name: "Assumed" })).toBeVisible();
  });
});

describe("questions", () => {
  test("open one at a time, with what they hold up and Bezl's recommendation", () => {
    render(<Harness id="deny-scopes" stage="build" />);
    const [first, second] = screen.getAllByRole("button", { expanded: true });
    expect(first).toHaveAccessibleName(/edits you haven't committed/);
    expect(second).toBeUndefined();
    expect(screen.getByText("Holds up attempt A")).toBeVisible();
    expect(screen.getByRole("button", { name: "Work around them" })).toHaveAccessibleDescription(
      "Recommended",
    );
    expect(screen.getByText(/Codex keeps your edits/)).toBeVisible();
  });

  test("each choice says what happens before you pick it", async () => {
    render(<Harness id="deny-scopes" stage="build" />);
    await userEvent.hover(screen.getByRole("button", { name: "Overwrite them" }));
    expect(screen.getByText(/Codex writes over them/)).toBeVisible();
  });

  test("an answer folds the question, opens the next and joins your decisions", async () => {
    const onQueue = vi.fn();
    render(<Harness id="deny-scopes" stage="build" onQueue={onQueue} />);
    await userEvent.click(screen.getByRole("button", { name: "Work around them" }));
    expect(onQueue).toHaveBeenCalledOnce();
    const answered = screen.getByRole("button", { name: /edits you haven't committed/ });
    expect(answered).toHaveAttribute("aria-expanded", "false");
    expect(answered).toHaveTextContent("Work around them");
    expect(screen.getByRole("button", { name: /internet access/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await userEvent.click(screen.getByRole("tab", { name: "Intent" }));
    expect(
      within(within(side()).getByRole("list", { name: "Decided" })).getByText(/Work around them/),
    ).toBeVisible();
  });

  test("what Bezl handled without you stays folded", async () => {
    render(<Harness id="deny-scopes" stage="build" />);
    const handled = screen.getByText(/Codex asked which error type to use/);
    expect(handled).not.toBeVisible();
    await userEvent.click(screen.getByText("Bezl handled 1 without you"));
    expect(handled).toBeVisible();
  });

  test("changing an assumption asks it here", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByRole("tab", { name: "Intent" }));
    const assumed = within(side()).getByRole("list", { name: "Assumed" });
    await userEvent.click(within(assumed).getAllByRole("button", { name: "Change" })[0] as Element);
    expect(screen.getByRole("button", { name: /What should the empty state say/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await userEvent.click(screen.getByRole("tab", { name: "Intent" }));
    expect(within(assumed).getByText("Now a question")).toBeVisible();
  });
});
