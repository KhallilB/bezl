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

// React Flow measures its pane; jsdom has neither of these.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.DOMMatrixReadOnly ??= class {
  m22 = 1;
} as unknown as typeof DOMMatrixReadOnly;

const screens = () => screen.getByRole("region", { name: "Screens" });
const evidence = () => screen.getByRole("region", { name: "Evidence" });
const intent = () => screen.getByRole("region", { name: "Intent" });
const toggle = () => screen.getByRole("button", { name: "Intent" });
const holds = (region: HTMLElement) => region.contains(document.activeElement);
const precedes = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("one column", () => {
  test("no side pane and no tabs on the page", () => {
    render(<Harness id="empty-state" stage="review" />);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  test("the stage, then its screens, then its evidence, then the next step", () => {
    render(<Harness id="empty-state" stage="review" />);
    const table = screen.getByRole("table", { name: "Before and after" });
    const next = screen.getByRole("region", { name: "Next step" });
    expect(precedes(table, screens())).toBe(true);
    expect(precedes(screens(), evidence())).toBe(true);
    expect(precedes(evidence(), next)).toBe(true);
  });

  test("with no screenshots there is no Screens section; Evidence starts from what needs you", () => {
    render(<Harness id="snapshot" stage="check" />);
    expect(screen.queryByRole("region", { name: "Screens" })).toBeNull();
    expect(within(evidence()).getByRole("list", { name: "What needs you" })).toBeVisible();
  });

  test("with nothing measured and no screens, neither section shows and nothing goes full screen", () => {
    render(<Harness id="debounce" stage="build" />);
    expect(screen.queryByRole("region", { name: "Screens" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Evidence" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Full screen" })).toBeNull();
  });
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
      within(summary).getByRole("button", { name: "41 of 51 lines ran in a test" }),
    ).toBeVisible();
  });

  test("no cards above the stage: no tiles, no flow", () => {
    render(<Harness id="empty-state" stage="review" />);
    expect(screen.queryByRole("button", { name: "Show the flow" })).toBeNull();
    expect(screen.queryByText(/When someone has no projects/)).toBeNull();
  });

  test("Intent opens under the header: what's proven, what you decided and what was assumed", async () => {
    render(<Harness id="empty-state" stage="review" />);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Intent" })).toBeNull();
    await userEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(toggle()).toHaveAttribute("aria-controls", intent().id);
    const done = within(intent()).getByRole("list", { name: "Done when" });
    expect(within(done).getAllByRole("listitem")).toHaveLength(4);
    expect(within(done).getByText("You check in Review")).toBeVisible();
    expect(within(intent()).getByRole("list", { name: "Decided" })).toBeVisible();
    expect(within(intent()).getByRole("list", { name: "Assumed" })).toBeVisible();
    await userEvent.click(toggle());
    expect(screen.queryByRole("region", { name: "Intent" })).toBeNull();
  });

  test("the goal opens Intent and moves you to it", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByRole("button", { name: "3 of 4 done" }));
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(holds(intent())).toBe(true);
  });

  test("what the change touches moves you to its screens", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByRole("button", { name: "3 files · +86 −4" }));
    expect(holds(screens())).toBe(true);
  });

  test("how much ran in a test moves you to the evidence", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByRole("button", { name: /lines ran in a test/ }));
    expect(holds(evidence())).toBe(true);
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
    await userEvent.click(toggle());
    expect(
      within(within(intent()).getByRole("list", { name: "Decided" })).getByText(/Work around them/),
    ).toBeVisible();
  });

  test("closing the open question folds it", async () => {
    render(<Harness id="deny-scopes" stage="build" />);
    const head = screen.getByRole("button", { name: /edits you haven't committed/ });
    await userEvent.click(head);
    expect(head).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { expanded: true })).toBeNull();
  });

  test("after the last answer, focus stays on the question you answered", async () => {
    render(<Harness id="deny-scopes" stage="build" />);
    await userEvent.click(screen.getByRole("button", { name: "Work around them" }));
    await userEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(document.activeElement).toHaveAccessibleName(/internet access/);
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
    await userEvent.click(toggle());
    const assumed = within(intent()).getByRole("list", { name: "Assumed" });
    await userEvent.click(within(assumed).getAllByRole("button", { name: "Change" })[0] as Element);
    expect(screen.getByRole("button", { name: /What should the empty state say/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(assumed).getByText("Now a question")).toBeVisible();
  });
});

describe("Screens", () => {
  test("shows the stage's screenshots at either size, with where each came from", async () => {
    render(<Harness id="empty-state" stage="review" />);
    expect(
      within(screens()).getByRole("img", { name: "Projects, After, at 375 px" }),
    ).toBeVisible();
    expect(within(screens()).getByText("375 px · Claude Code · 4e1c2b9")).toBeVisible();
    await userEvent.click(within(screens()).getByRole("button", { name: "Desktop" }));
    expect(
      within(screens()).getByRole("img", { name: "Projects, After, at 1280 px" }),
    ).toBeVisible();
    await userEvent.click(within(screens()).getByRole("button", { name: "Before" }));
    expect(
      within(screens()).getByRole("img", { name: "Projects, Before, at 1280 px" }),
    ).toBeVisible();
  });

  test("screenshot and size are toolbars, like the rest of the app", () => {
    render(<Harness id="empty-state" stage="review" />);
    const size = within(screens()).getByRole("toolbar", { name: "Size" });
    expect(within(size).getByRole("button", { name: "Phone" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(screens()).getByRole("toolbar", { name: "Screenshot" })).toBeVisible();
  });

  test("full screen keeps your notes and puts two screenshots side by side", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(within(screens()).getByRole("button", { name: "Add a note" }));
    await userEvent.click(within(screens()).getByRole("button", { name: "Put your note here" }));
    await userEvent.type(
      within(screens()).getByRole("textbox", { name: "Your note" }),
      "Bigger button",
    );
    await userEvent.click(within(screens()).getByRole("button", { name: "Add note" }));
    await userEvent.click(within(screens()).getByRole("button", { name: "Full screen" }));
    const full = screen.getByRole("dialog", { name: "Empty state for Projects" });
    expect(within(full).getByRole("tab", { name: "Screens" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(full).getByText("Bigger button")).toBeVisible();
    const beside = within(full).getByRole("toolbar", { name: "Beside it" });
    await userEvent.click(within(beside).getByRole("button", { name: "Before" }));
    expect(within(full).getByRole("img", { name: "Projects, After, at 375 px" })).toBeVisible();
    expect(within(full).getByRole("img", { name: "Projects, Before, at 375 px" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(screens()).getByText("Bigger button")).toBeVisible();
  });

  test("pins Bezl's findings where they are", () => {
    render(<Harness id="empty-state" stage="review" />);
    const pins = within(screens()).getByRole("list", { name: "On this screenshot" });
    expect(within(pins).getByText("The Import from GitHub link does nothing yet")).toBeVisible();
  });

  test("a note goes where you put it", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(within(screens()).getByRole("button", { name: "Add a note" }));
    await userEvent.click(within(screens()).getByRole("button", { name: "Put your note here" }));
    await userEvent.type(
      within(screens()).getByRole("textbox", { name: "Your note" }),
      "Bigger button",
    );
    await userEvent.click(within(screens()).getByRole("button", { name: "Add note" }));
    const pins = within(screens()).getByRole("list", { name: "On this screenshot" });
    expect(within(pins).getByText("Bigger button")).toBeVisible();
    expect(within(screens()).getByRole("button", { name: "Add another note" })).toBeVisible();
  });

  test("a finding on the screenshot shows where it comes from in Evidence", async () => {
    render(<Harness id="empty-state" stage="review" />);
    const pins = within(screens()).getByRole("list", { name: "On this screenshot" });
    await userEvent.click(
      within(pins).getByRole("button", { name: /The Import from GitHub link does nothing yet/ }),
    );
    expect(
      within(evidence()).getByRole("button", { name: /Import from GitHub does nothing yet/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(holds(evidence())).toBe(true);
  });

  test("pointing at a choice shows an example of it, marked as not built", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(toggle());
    const assumed = within(intent()).getByRole("list", { name: "Assumed" });
    await userEvent.click(within(assumed).getAllByRole("button", { name: "Change" })[0] as Element);
    await userEvent.hover(screen.getByRole("button", { name: "Let's start your first project" }));
    expect(within(screens()).getByRole("img", { name: /warm copy/ })).toBeVisible();
    expect(within(screens()).getByText("Example, not built yet")).toBeVisible();
  });

  test("a change with no screens has no Screens section", () => {
    render(<Harness id="deny-scopes" stage="build" />);
    expect(screen.queryByRole("region", { name: "Screens" })).toBeNull();
    expect(screen.queryByRole("button", { name: /across/ })).toBeNull();
  });
});

describe("Evidence", () => {
  test("starts from what needs you, then shows how one connects", async () => {
    render(<Harness id="empty-state" stage="review" />);
    expect(within(evidence()).getByText(/51 lines changed: 41 ran in a test/)).toBeVisible();
    await userEvent.click(
      within(evidence()).getByRole("button", { name: /Import from GitHub does nothing yet/ }),
    );
    const chain = within(evidence()).getByRole("list", { name: "How it connects" });
    expect(within(chain).getByRole("button", { name: /Codex review/ })).toBeVisible();
    expect(within(chain).getByRole("button", { name: /ImportLink/ })).toBeVisible();
    expect(within(chain).queryByRole("button", { name: /Projects\(\)/ })).toBeNull();
  });

  test("Why Bezl asks shows that question in Evidence and moves you there", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByRole("button", { name: "Why Bezl asks" }));
    expect(
      within(evidence()).getByRole("button", { name: /Import from GitHub does nothing yet/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(holds(evidence())).toBe(true);
  });

  test("a problem's See the trace shows that problem in Evidence", async () => {
    render(<Harness id="snapshot" stage="check" />);
    await userEvent.click(screen.getByRole("button", { name: "See the trace" }));
    expect(
      within(evidence()).getByRole("button", { name: /Cursor lands one row low/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(holds(evidence())).toBe(true);
  });

  test("the chain says plainly when only the plan links code to the goal", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(
      within(evidence()).getByRole("button", { name: /Import from GitHub does nothing yet/ }),
    );
    const chain = within(evidence()).getByRole("list", { name: "How it connects" });
    expect(
      within(chain).getByText("The plan says this code serves the goal; no test has shown it yet."),
    ).toBeVisible();
  });

  test("the risk says what it is based on", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByRole("button", { name: /Low risk/ }));
    expect(
      within(intent()).getByText(/Based on 3 files changed, all inside the allowed paths/),
    ).toBeVisible();
  });
});

describe("Full screen", () => {
  const full = () => screen.getByRole("dialog", { name: "Empty state for Projects" });
  const openFull = async (from: () => HTMLElement = screens) => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(within(from()).getByRole("button", { name: "Full screen" }));
  };

  test("each section opens full screen on its own tab", async () => {
    await openFull(evidence);
    expect(within(full()).getByRole("tab", { name: "Evidence" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      within(full())
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Screens", "Evidence", "Intent"]);
  });

  test("arrow keys move between the tabs", async () => {
    await openFull();
    within(full()).getByRole("tab", { name: "Screens" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    const tab = (name: string) => within(full()).getByRole("tab", { name });
    expect(tab("Evidence")).toHaveFocus();
    expect(tab("Evidence")).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{End}");
    expect(tab("Intent")).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(tab("Screens")).toHaveFocus();
  });

  test("your path lists each step toward the goal and what it holds up", async () => {
    await openFull();
    const path = within(full()).getByRole("list", { name: "Your path" });
    const first = within(path).getByRole("button", { name: /Import from GitHub does nothing yet/ });
    expect(first).toHaveAccessibleDescription(
      "Holds up: One clear way to create the first project",
    );
    expect(
      within(path).getByRole("button", { name: /Does it look right/ }),
    ).toHaveAccessibleDescription("Holds up 3 done-when lines");
  });

  test("a step opens in Selected, and See the screen shows where it is", async () => {
    await openFull(evidence);
    await userEvent.click(
      within(full()).getByRole("button", { name: /Import from GitHub does nothing yet/ }),
    );
    const inspector = within(full()).getByRole("region", { name: "Selected" });
    expect(within(inspector).getByText("One clear way to create the first project")).toBeVisible();
    await userEvent.click(within(inspector).getByRole("button", { name: "See the screen" }));
    expect(within(full()).getByRole("tab", { name: "Screens" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const pins = within(full()).getByRole("list", { name: "On this screenshot" });
    expect(
      within(pins).getByRole("button", { name: /The Import from GitHub link does nothing yet/ }),
    ).toHaveAttribute("aria-current", "true");
  });

  test("a finding on the screenshot traces back on the evidence map", async () => {
    await openFull();
    const pins = within(full()).getByRole("list", { name: "On this screenshot" });
    await userEvent.click(
      within(pins).getByRole("button", { name: /The Import from GitHub link does nothing yet/ }),
    );
    const inspector = within(full()).getByRole("region", { name: "Selected" });
    await userEvent.click(within(inspector).getByRole("button", { name: "See the trace" }));
    expect(within(full()).getByRole("tab", { name: "Evidence" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      within(full()).getByRole("button", { name: /Import from GitHub does nothing yet/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("the map says which links the plan claims and which Bezl checked", async () => {
    await openFull(evidence);
    expect(within(full()).getByText(/Dotted: the plan says they connect/)).toBeVisible();
  });

  test("the stage's decision comes along, and stays made when you leave", async () => {
    render(<Harness id="snapshot" stage="check" />);
    await userEvent.click(within(evidence()).getByRole("button", { name: "Full screen" }));
    const dialog = screen.getByRole("dialog", { name: /Terminal snapshot/ });
    const bar = within(dialog).getByRole("region", { name: "Next step" });
    await userEvent.click(within(bar).getByRole("button", { name: "Send 2 problems to Codex" }));
    expect(within(bar).getByRole("status")).toHaveTextContent(/Sent 2 problems to Codex/);
    await userEvent.keyboard("{Escape}");
    const inline = screen.getByRole("region", { name: "Next step" });
    expect(within(inline).getByRole("status")).toHaveTextContent(/Sent 2 problems to Codex/);
  });
});
