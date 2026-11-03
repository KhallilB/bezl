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

const ONE_WAY = "There's one clear way to create the first project";
const SHOWS = "The empty state shows when there are no projects";
const RESTORES = "A snapshot restores the colours and the cursor position";
const STAYS = "Snapshots stay in .git/bezl";

const list = () => screen.getByRole("list", { name: "You asked for" });
const row = (name: string | RegExp) =>
  within(list()).getByRole("button", { name: typeof name === "string" ? new RegExp(name) : name });
const detail = (name: string) => screen.getByRole("region", { name });

describe("header", () => {
  test("the goal in your words, the status and a quiet line of facts", () => {
    render(<Harness id="empty-state" stage="review" />);
    expect(
      screen.getByText(/the Projects page should help them start one/, { selector: "blockquote" }),
    ).toBeVisible();
    const facts = screen.getByRole("list", { name: "This task" });
    expect(within(facts).getByText("3 files · +86 −4")).toBeVisible();
    expect(within(facts).getByText("Low risk")).toBeVisible();
    expect(
      within(facts).getByText(/based on 3 files changed, all inside the allowed paths/),
    ).toBeVisible();
    expect(within(facts).getByText("41 of 51 changed lines ran in a test")).toBeVisible();
  });

  test("no side pane, no tabs and no Intent toggle", () => {
    render(<Harness id="empty-state" stage="review" />);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("button", { name: /Intent/ })).toBeNull();
  });

  test("pointing at a stage says what happened there and who acted", async () => {
    render(<Harness id="empty-state" stage="review" />);
    const stages = screen.getByRole("navigation", { name: "Stages" });
    await userEvent.hover(within(stages).getByRole("button", { name: /^Define/ }));
    expect(await screen.findByText(/You, from the issue/)).toBeVisible();
  });
});

describe("You asked for", () => {
  test("each done-when line with its state at this stage", () => {
    render(<Harness id="empty-state" stage="review" />);
    expect(row(SHOWS)).toHaveAccessibleName(/Works/);
    expect(row(ONE_WAY)).toHaveAccessibleName(/Needs you.*1 question for you/);
    // Four lines, Other checks, Not tied to a line.
    expect(within(list()).getAllByRole("listitem")).toHaveLength(6);
  });

  test("on Review a line says how it was on main and how it is now", () => {
    render(<Harness id="empty-state" stage="review" />);
    expect(row(SHOWS)).toHaveAccessibleName(/main.*Fails.*now.*Works/);
  });

  test("before Check a line is not checked yet", () => {
    render(<Harness id="deny-scopes" stage="build" />);
    expect(row("An empty scope list is refused")).toHaveAccessibleName(/Not checked yet/);
  });

  test("opens on the first line that needs you", () => {
    render(<Harness id="empty-state" stage="review" />);
    expect(row(ONE_WAY)).toHaveAttribute("aria-current", "true");
    expect(row(SHOWS)).not.toHaveAttribute("aria-current");
    expect(detail(ONE_WAY)).toBeVisible();
  });

  test("otherwise on the first that fails, otherwise on the first", () => {
    const { unmount } = render(<Harness id="snapshot" stage="check" />);
    expect(row(RESTORES)).toHaveAttribute("aria-current", "true");
    unmount();
    render(<Harness id="debounce" stage="build" />);
    expect(row("Each pane resizes")).toHaveAttribute("aria-current", "true");
  });

  test("a line shows its question, screenshot, code, checks and a way to the map", () => {
    render(<Harness id="empty-state" stage="review" />);
    const pane = detail(ONE_WAY);
    expect(within(pane).getByRole("button", { name: /Claude Code disagrees/ })).toBeVisible();
    expect(within(pane).getByRole("img", { name: "Projects, After, at 375 px" })).toBeVisible();
    const code = within(pane).getByRole("list", { name: "In the code" });
    expect(within(code).getByText("ImportLink")).toBeVisible();
    expect(within(code).getByText("Projects.tsx:41")).toBeVisible();
    expect(
      within(pane).getByText("The plan says this code serves the goal; no test has shown it yet."),
    ).toBeVisible();
    const ran = within(pane).getByRole("list", { name: "What ran" });
    expect(within(ran).getByText("Codex review")).toBeVisible();
    expect(within(pane).getByRole("button", { name: "Open the map" })).toBeVisible();
  });

  test("picking a line shows it and moves you to it", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(row(SHOWS));
    expect(row(SHOWS)).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("region", { name: ONE_WAY })).toBeNull();
    expect(document.activeElement).toHaveTextContent(SHOWS);
    expect(detail(SHOWS).contains(document.activeElement)).toBe(true);
  });

  test("arrow keys move between lines without picking; Enter picks", async () => {
    render(<Harness id="snapshot" stage="check" />);
    row(RESTORES).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(row(STAYS)).toHaveFocus();
    expect(row(RESTORES)).toHaveAttribute("aria-current", "true");
    await userEvent.keyboard("{Enter}");
    expect(row(STAYS)).toHaveAttribute("aria-current", "true");
    expect(detail(STAYS).contains(document.activeElement)).toBe(true);
    row(STAYS).focus();
    await userEvent.keyboard("{Home}");
    expect(row(RESTORES)).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(row(STAYS)).toHaveFocus();
  });

  test("Not tied to a line holds what matches no line", () => {
    render(<Harness id="deny-scopes" stage="build" />);
    expect(row("Not tied to a line")).toHaveAttribute("aria-current", "true");
    const pane = detail("Not tied to a line");
    expect(within(pane).getAllByRole("button", { expanded: false })).toHaveLength(1);
    expect(within(pane).getByText("crates/bezl-domain/tests/policy.rs")).toBeVisible();
  });

  test("with nothing loose there is no such entry", () => {
    render(<Harness id="snapshot" stage="check" />);
    expect(within(list()).queryByRole("button", { name: /Not tied to a line/ })).toBeNull();
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
    expect(screen.getByText(/Codex writes over them/)).toBeVisible();
  });

  test("an answer folds the question, opens the next and joins your answers", async () => {
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
    const answers = screen.getByRole("list", { name: "Your answers" });
    expect(within(answers).getByText(/Work around them/)).toBeInTheDocument();
  });

  test("answering a line's question changes what the line says and keeps your answer there", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByRole("button", { name: "Side with Codex" }));
    expect(row(ONE_WAY)).not.toHaveAccessibleName(/question/);
    expect(row(ONE_WAY)).toHaveAccessibleName(/main.*Fails.*now.*Needs you/);
    expect(
      within(detail(ONE_WAY)).getByRole("button", { name: /Claude Code disagrees/ }),
    ).toHaveTextContent("Side with Codex");
    const answers = screen.getByRole("list", { name: "Your answers" });
    expect(within(answers).getByText(/Side with Codex/)).toBeInTheDocument();
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

  test("changing a guess asks it as a question, not tied to a line", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByText("Made without asking you (2)"));
    const guesses = screen.getByRole("list", { name: "Made without asking you" });
    await userEvent.click(within(guesses).getAllByRole("button", { name: "Change" })[0] as Element);
    expect(row("Not tied to a line")).toHaveAttribute("aria-current", "true");
    expect(
      within(detail("Not tied to a line")).getByRole("button", {
        name: /What should the empty state say/,
      }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(within(guesses).getByText("Now a question")).toBeVisible();
  });

  test("pointing at a choice shows an example of it, marked as not built", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByText("Made without asking you (2)"));
    const guesses = screen.getByRole("list", { name: "Made without asking you" });
    await userEvent.click(within(guesses).getAllByRole("button", { name: "Change" })[0] as Element);
    await userEvent.hover(screen.getByRole("button", { name: "Let's start your first project" }));
    const pane = detail("Not tied to a line");
    expect(within(pane).getByRole("img", { name: /warm copy/ })).toBeVisible();
    expect(within(pane).getByText("Example, not built yet")).toBeVisible();
  });
});

describe("screenshots", () => {
  const shots = () => within(detail(ONE_WAY));

  test("at either size, with where each came from", async () => {
    render(<Harness id="empty-state" stage="review" />);
    expect(shots().getByText("375 px · Claude Code · 4e1c2b9")).toBeVisible();
    await userEvent.click(shots().getByRole("button", { name: "Desktop" }));
    expect(shots().getByRole("img", { name: "Projects, After, at 1280 px" })).toBeVisible();
    await userEvent.click(shots().getByRole("button", { name: "Before" }));
    expect(shots().getByRole("img", { name: "Projects, Before, at 1280 px" })).toBeVisible();
    expect(shots().getByRole("toolbar", { name: "Size" })).toBeVisible();
  });

  test("pins Bezl's findings, and a note goes where you put it", async () => {
    render(<Harness id="empty-state" stage="review" />);
    const pins = () => shots().getByRole("list", { name: "On this screenshot" });
    expect(within(pins()).getByText("The Import from GitHub link does nothing yet")).toBeVisible();
    await userEvent.click(shots().getByRole("button", { name: "Add a note" }));
    await userEvent.click(shots().getByRole("button", { name: "Put your note here" }));
    await userEvent.type(shots().getByRole("textbox", { name: "Your note" }), "Bigger button");
    await userEvent.click(shots().getByRole("button", { name: "Add note" }));
    expect(within(pins()).getByText("Bigger button")).toBeVisible();
  });

  test("a line with no screenshot shows none", () => {
    render(<Harness id="debounce" stage="build" />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("Open the map", () => {
  const full = () => screen.getByRole("dialog", { name: "Empty state for Projects" });
  const openMap = async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(within(detail(ONE_WAY)).getByRole("button", { name: "Open the map" }));
  };

  test("opens on the map at the line, with your path; tabs say what they show", async () => {
    await openMap();
    const tab = (name: string) => within(full()).getByRole("tab", { name });
    expect(
      within(full())
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Map", "Screenshots"]);
    expect(tab("Map")).toHaveAttribute("aria-selected", "true");
    const path = within(full()).getByRole("list", { name: "Your path" });
    expect(
      within(path).getByRole("button", { name: /Import from GitHub does nothing yet/ }),
    ).toHaveAccessibleDescription("Holds up: One clear way to create the first project");
    expect(within(full()).getByText(/Dotted: the plan says they connect/)).toBeVisible();
  });

  test("arrow keys move between the tabs", async () => {
    await openMap();
    const tab = (name: string) => within(full()).getByRole("tab", { name });
    tab("Map").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(tab("Screenshots")).toHaveFocus();
    expect(tab("Screenshots")).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Home}");
    expect(tab("Map")).toHaveFocus();
  });

  test("a step's See the screen and a pin's Show in the map go back and forth", async () => {
    await openMap();
    await userEvent.click(
      within(full()).getByRole("button", { name: /Import from GitHub does nothing yet/ }),
    );
    const inspector = () => within(full()).getByRole("region", { name: "Selected" });
    await userEvent.click(within(inspector()).getByRole("button", { name: "See the screen" }));
    expect(within(full()).getByRole("tab", { name: "Screenshots" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const pins = within(full()).getByRole("list", { name: "On this screenshot" });
    expect(
      within(pins).getByRole("button", { name: /The Import from GitHub link does nothing yet/ }),
    ).toHaveAttribute("aria-current", "true");
    await userEvent.click(within(inspector()).getByRole("button", { name: "Show in the map" }));
    expect(within(full()).getByRole("tab", { name: "Map" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("Why Bezl asks opens the map at that question", async () => {
    render(<Harness id="empty-state" stage="review" />);
    await userEvent.click(screen.getByRole("button", { name: "Why Bezl asks" }));
    const path = within(full()).getByRole("list", { name: "Your path" });
    expect(
      within(path).getByRole("button", { name: /Import from GitHub does nothing yet/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("a problem's Show in the map opens the map at that problem", async () => {
    render(<Harness id="snapshot" stage="check" />);
    await userEvent.click(screen.getByRole("button", { name: "Show in the map" }));
    const dialog = screen.getByRole("dialog", { name: /Terminal snapshot/ });
    const path = within(dialog).getByRole("list", { name: "Your path" });
    expect(within(path).getByRole("button", { name: /Cursor lands one row low/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("the stage's decision comes along, and stays made when you leave", async () => {
    render(<Harness id="snapshot" stage="check" />);
    await userEvent.click(within(detail(RESTORES)).getByRole("button", { name: "Open the map" }));
    const dialog = screen.getByRole("dialog", { name: /Terminal snapshot/ });
    const bar = within(dialog).getByRole("region", { name: "Next step" });
    await userEvent.click(within(bar).getByRole("button", { name: "Send 2 problems to Codex" }));
    expect(within(bar).getByRole("status")).toHaveTextContent(/Sent 2 problems to Codex/);
    await userEvent.keyboard("{Escape}");
    const inline = screen.getByRole("region", { name: "Next step" });
    expect(within(inline).getByRole("status")).toHaveTextContent(/Sent 2 problems to Codex/);
  });

  test("nothing traced, no map", () => {
    render(<Harness id="debounce" stage="build" />);
    expect(screen.queryByRole("button", { name: "Open the map" })).toBeNull();
  });
});
