import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { needsYou } from "../approvals/fixtures";
import type { NeedsYouItem } from "../approvals/model";
import { tasks } from "./fixtures";
import type { StageId } from "./model";
import { TaskPage } from "./TaskPage";

function Harness({
  id,
  stage,
  onQueue,
  onStage = vi.fn(),
}: {
  id: string;
  stage: StageId;
  onQueue?: () => void;
  onStage?: (s: StageId) => void;
}) {
  const task = tasks.find((t) => t.id === id);
  const [queue, setQueue] = useState<NeedsYouItem[]>(needsYou);
  if (!task) throw new Error(`no fixture ${id}`);
  return (
    <TaskPage
      task={task}
      stage={stage}
      onStage={onStage}
      needsYou={queue}
      onNeedsYou={(items) => {
        setQueue(items);
        onQueue?.();
      }}
    />
  );
}

const side = () => screen.getByRole("tabpanel");

test("the side is evidence, labelled so", () => {
  render(<Harness id="empty-state" stage="review" />);
  expect(screen.getByRole("complementary", { name: "Evidence" })).toBeVisible();
});

describe("summary", () => {
  test("one line under the stages: the goal, the change's reach and how sure Bezl is", () => {
    render(<Harness id="empty-state" stage="review" />);
    const summary = screen.getByRole("list", { name: "This task" });
    expect(within(summary).getByRole("button", { name: "3 of 4 done" })).toBeVisible();
    expect(within(summary).getByRole("button", { name: "3 files · +86 −4" })).toBeVisible();
    expect(within(summary).getByText("Low risk")).toBeVisible();
    expect(within(summary).getByText("Projects page only")).toBeVisible();
    expect(
      within(summary).getByRole("button", { name: "41 of 51 lines run in a test" }),
    ).toBeVisible();
  });

  test("no cards above the stage: no tiles, no flow", () => {
    render(<Harness id="empty-state" stage="review" />);
    expect(screen.queryByRole("button", { name: "Show the flow" })).toBeNull();
    expect(screen.queryByText(/When someone has no projects/)).toBeNull();
  });

  test("the goal opens Intent: what's proven, what you decided and what was assumed", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByRole("button", { name: "3 of 4 done" }));
    expect(screen.getByRole("tab", { name: "Intent" })).toHaveAttribute("aria-selected", "true");
    const done = within(side()).getByRole("list", { name: "Done when" });
    expect(within(done).getAllByRole("listitem")).toHaveLength(4);
    expect(within(done).getByText("You check in Review")).toBeVisible();
    expect(within(side()).getByRole("list", { name: "Decided" })).toBeVisible();
    expect(within(side()).getByRole("list", { name: "Assumed" })).toBeVisible();
  });

  test("pointing at a stage says what happened there and who acted", async () => {
    render(<Harness id="empty-state" stage="review" />);
    const stages = screen.getByRole("navigation", { name: "Stages" });
    await userEvent.hover(within(stages).getByRole("button", { name: /^Define/ }));
    expect(await screen.findByText(/You, from the issue/)).toBeVisible();
  });
});

describe("questions", () => {
  test("open one at a time, with what they hold up and Bezl's recommendation", () => {
    render(<Harness id="deny-scopes" stage="build" />);
    const [first, second] = screen.getAllByRole("button", { expanded: true });
    expect(first).toHaveAccessibleName(/edits you haven't committed/);
    expect(second).toBeUndefined();
    expect(screen.getByText("Holds up the attempt")).toBeVisible();
    expect(screen.getByRole("button", { name: "Work around them" })).toHaveAccessibleDescription(
      "Recommended",
    );
    expect(screen.getByText(/Codex keeps your edits/)).toBeVisible();
  });

  test("each choice shows what it costs and what it unblocks", async () => {
    render(<Harness id="deny-scopes" stage="build" />);
    const then = screen.getByText(/Codex keeps your edits/).closest("p") as HTMLElement;
    expect(within(then).getByText("Keeps your edits")).toBeVisible();
    await userEvent.hover(screen.getByRole("button", { name: "Overwrite them" }));
    expect(screen.getByText("Your edits stay out of it")).toBeVisible();
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

describe("Preview", () => {
  const preview = () => screen.getByRole("tab", { name: "Preview" });

  test("shows the stage's screenshots at either size, with where each came from", async () => {
    render(<Harness id="empty-state" stage="review" />);
    expect(preview()).toHaveAttribute("aria-selected", "true");
    expect(within(side()).getByRole("img", { name: "Projects, After, at 375 px" })).toBeVisible();
    expect(within(side()).getByText("375 px · Claude Code · 4e1c2b9")).toBeVisible();
    await userEvent.click(within(side()).getByRole("button", { name: "Desktop" }));
    expect(within(side()).getByRole("img", { name: "Projects, After, at 1280 px" })).toBeVisible();
    await userEvent.click(within(side()).getByRole("button", { name: "Before" }));
    expect(within(side()).getByRole("img", { name: "Projects, Before, at 1280 px" })).toBeVisible();
  });

  test("screenshot and size are toolbars, like the rest of the app", () => {
    render(<Harness id="empty-state" stage="review" />);
    const size = within(side()).getByRole("toolbar", { name: "Size" });
    expect(within(size).getByRole("button", { name: "Phone" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(side()).getByRole("toolbar", { name: "Screenshot" })).toBeVisible();
  });

  test("Preview widens the evidence; another tab gives the room back", async () => {
    render(<Harness id="empty-state" stage="review" />);
    const bench = screen.getByRole("complementary", { name: "Evidence" }).closest(".journey-bench");
    expect(bench).toHaveAttribute("data-wide");
    await userEvent.click(screen.getByRole("tab", { name: "Intent" }));
    expect(bench).not.toHaveAttribute("data-wide");
  });

  test("Expand opens a design review, with the notes you left", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(within(side()).getByRole("button", { name: "Add a note" }));
    await userEvent.click(within(side()).getByRole("button", { name: "Put your note here" }));
    await userEvent.type(
      within(side()).getByRole("textbox", { name: "Your note" }),
      "Bigger button",
    );
    await userEvent.click(within(side()).getByRole("button", { name: "Add note" }));
    await userEvent.click(within(side()).getByRole("button", { name: "Expand" }));
    const review = screen.getByRole("dialog", { name: "Design review · Projects" });
    expect(within(review).getByRole("img", { name: "Projects, After, at 375 px" })).toBeVisible();
    expect(within(review).getByText("Bigger button")).toBeVisible();
    expect(within(review).getByText("The Import from GitHub link does nothing yet")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(side()).getByText("Bigger button")).toBeVisible();
  });

  test("the design review puts two screenshots side by side", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(within(side()).getByRole("button", { name: "Expand" }));
    const review = screen.getByRole("dialog", { name: "Design review · Projects" });
    const beside = within(review).getByRole("toolbar", { name: "Beside it" });
    expect(within(beside).getByRole("button", { name: "Nothing" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(within(beside).getByRole("button", { name: "Before" }));
    expect(within(review).getByRole("img", { name: "Projects, After, at 375 px" })).toBeVisible();
    expect(within(review).getByRole("img", { name: "Projects, Before, at 375 px" })).toBeVisible();
    await userEvent.click(within(review).getByRole("button", { name: "Desktop" }));
    expect(within(review).getByRole("img", { name: "Projects, Before, at 1280 px" })).toBeVisible();
  });

  test("pins Bezl's findings where they are", () => {
    render(<Harness id="empty-state" stage="review" />);
    const pins = within(side()).getByRole("list", { name: "On this screenshot" });
    expect(within(pins).getByText("The Import from GitHub link does nothing yet")).toBeVisible();
  });

  test("a note goes where you put it", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(within(side()).getByRole("button", { name: "Add a note" }));
    await userEvent.click(within(side()).getByRole("button", { name: "Put your note here" }));
    await userEvent.type(
      within(side()).getByRole("textbox", { name: "Your note" }),
      "Bigger button",
    );
    await userEvent.click(within(side()).getByRole("button", { name: "Add note" }));
    const pins = within(side()).getByRole("list", { name: "On this screenshot" });
    expect(within(pins).getByText("Bigger button")).toBeVisible();
    expect(within(side()).getByRole("button", { name: "Add another note" })).toBeVisible();
  });

  test("what the change touches opens Preview", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByRole("tab", { name: "Intent" }));
    await userEvent.click(screen.getByRole("button", { name: "3 files · +86 −4" }));
    expect(preview()).toHaveAttribute("aria-selected", "true");
  });

  test("pointing at a choice shows an example of it, marked as not built", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByRole("tab", { name: "Intent" }));
    const assumed = within(side()).getByRole("list", { name: "Assumed" });
    await userEvent.click(within(assumed).getAllByRole("button", { name: "Change" })[0] as Element);
    await userEvent.hover(screen.getByRole("button", { name: "Let's start your first project" }));
    expect(preview()).toHaveAttribute("aria-selected", "true");
    expect(within(side()).getByRole("img", { name: /warm copy/ })).toBeVisible();
    expect(within(side()).getByText("Example, not built yet")).toBeVisible();
  });

  test("a change with no screens has no Preview", () => {
    render(<Harness id="deny-scopes" stage="build" />);
    expect(screen.queryByRole("tab", { name: "Preview" })).toBeNull();
    expect(screen.queryByRole("button", { name: /across/ })).toBeNull();
  });

  test("arrow keys move between the tabs", async () => {
    render(<Harness id="empty-state" stage="review" />);
    preview().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Trace" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Trace" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Intent" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(preview()).toHaveFocus();
  });
});

describe("Trace", () => {
  const trace = () => screen.getByRole("tab", { name: "Trace" });

  test("starts from what needs you, then shows how one connects", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(trace());
    expect(within(side()).getByText(/51 changed lines: 41 run in a test/)).toBeVisible();
    await userEvent.click(
      within(side()).getByRole("button", { name: /Import from GitHub does nothing yet/ }),
    );
    const chain = within(side()).getByRole("list", { name: "How it connects" });
    expect(within(chain).getByRole("button", { name: /Codex review/ })).toBeVisible();
    expect(within(chain).getByRole("button", { name: /ImportLink/ })).toBeVisible();
    expect(within(chain).queryByRole("button", { name: /Projects\(\)/ })).toBeNull();
  });

  test("Why Bezl asks opens the trace at that question", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByRole("button", { name: "Why Bezl asks" }));
    expect(trace()).toHaveAttribute("aria-selected", "true");
    expect(
      within(side()).getByRole("button", { name: /Import from GitHub does nothing yet/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("the evidence opens Trace", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByRole("button", { name: /lines run in a test/ }));
    expect(trace()).toHaveAttribute("aria-selected", "true");
  });

  test("a problem opens the trace at itself", async () => {
    render(<Harness id="snapshot" stage="check" />);
    await userEvent.click(screen.getByRole("button", { name: "See the trace" }));
    expect(
      within(side()).getByRole("button", { name: /Cursor lands one row low/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("nothing measured, no Trace", () => {
    render(<Harness id="debounce" stage="build" />);
    expect(screen.queryByRole("tab", { name: "Trace" })).toBeNull();
  });
});
