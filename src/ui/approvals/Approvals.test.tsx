import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { tasks } from "../journey/fixtures";
import { TaskPage } from "../journey/TaskPage";
import { Approvals } from "./Approvals";
import { needsYou } from "./fixtures";
import type { NeedsYouItem } from "./model";

function Queue({ initial, onOpenTask }: { initial: NeedsYouItem[]; onOpenTask: () => void }) {
  const [items, setItems] = useState(initial);
  return <Approvals items={items} onItems={setItems} onOpenTask={onOpenTask} />;
}

describe("Approvals", () => {
  test("lists each item with its task, who asks, how long it waited and the choices", () => {
    render(<Queue initial={needsYou} onOpenTask={vi.fn()} />);
    expect(screen.getByText("3 things need you.")).toBeVisible();
    const question = screen.getByRole("article", { name: /Question from Codex/ });
    expect(within(question).getByText("Deny empty scopes")).toBeVisible();
    expect(within(question).getByText(/6 min/)).toBeVisible();
    expect(within(question).getByRole("button", { name: "Work around them" })).toBeVisible();
  });

  test("answering takes the item off and says what happens next", async () => {
    render(<Queue initial={needsYou} onOpenTask={vi.fn()} />);
    const access = screen.getByRole("article", { name: /More access from Codex/ });
    await userEvent.click(within(access).getByRole("button", { name: "Deny" }));
    expect(screen.queryByRole("article", { name: /More access/ })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/Codex continues without it/);
    expect(screen.getByText("2 things need you.")).toBeVisible();
  });

  test("an empty queue says nothing needs you", async () => {
    render(<Queue initial={needsYou.slice(0, 1)} onOpenTask={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Work around them" }));
    expect(screen.getByRole("heading", { name: "Nothing needs you" })).toBeVisible();
  });

  test("the task name opens the task", async () => {
    const onOpenTask = vi.fn();
    render(<Queue initial={needsYou} onOpenTask={onOpenTask} />);
    const dispute = screen.getByRole("article", { name: /Disputed finding/ });
    await userEvent.click(within(dispute).getByRole("link", { name: "Empty state for Projects" }));
    expect(onOpenTask).toHaveBeenCalledWith("empty-state", "review");
  });
});

describe("Needs you inline", () => {
  test("an item waits in the stage it came from, and answering it there clears it", async () => {
    const task = tasks.find((t) => t.id === "deny-scopes");
    if (!task) throw new Error("fixture");
    function Page() {
      const [items, setItems] = useState(needsYou);
      return (
        <TaskPage
          task={task as NonNullable<typeof task>}
          stage="build"
          onStage={vi.fn()}
          needsYou={items}
          onNeedsYou={setItems}
        />
      );
    }
    render(<Page />);
    expect(screen.getAllByRole("article", { name: /from Codex/ })).toHaveLength(2);
    expect(screen.queryByRole("article", { name: /Disputed finding/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Work around them" }));
    expect(screen.getAllByRole("article", { name: /from Codex/ })).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(/keeps your edits/);
  });
});
