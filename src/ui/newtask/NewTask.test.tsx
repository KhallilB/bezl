import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { crew, issues, read } from "./fixtures";
import { NewTask, type NewTaskProps } from "./NewTask";

const text = "Help people with no projects start their first one.";
const next = () => userEvent.click(screen.getByRole("button", { name: /^Next/ }));
const change = (part: string) =>
  userEvent.click(screen.getByRole("button", { name: `Change ${part}` }));
const row = (part: string) => screen.getByRole("listitem", { name: part });
const stepNow = () =>
  within(screen.getByRole("list", { name: "New task steps" })).getByRole("listitem", {
    current: "step",
  });

function setup(props: Partial<NewTaskProps> = {}) {
  const onStart = vi.fn();
  render(
    <NewTask
      repo="studio-web"
      branch="main"
      initial={{ text: "", doneWhen: [] }}
      read={read}
      providers={crew}
      setup="bun install"
      onStart={onStart}
      {...props}
    />,
  );
  return { onStart };
}

describe("NewTask steps", () => {
  test("walks Goal then Review and start, and Back keeps what you wrote", async () => {
    setup();
    expect(stepNow()).toHaveTextContent("Goal");
    await userEvent.type(screen.getByRole("textbox", { name: "Goal" }), text);
    await next();
    expect(stepNow()).toHaveTextContent("Review and start");
    expect(screen.queryByRole("textbox", { name: "Goal" })).toBeNull();
    expect(within(row("Goal")).getByText(text)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("textbox", { name: "Goal" })).toHaveValue(text);
  });

  test("the walkthrough can open on the review", () => {
    setup({ step: "review" });
    expect(stepNow()).toHaveTextContent("Review and start");
  });
});

describe("NewTask goal", () => {
  test("asks only for the goal, and says why a sentence helps", async () => {
    setup();
    expect(screen.queryByRole("textbox", { name: "Who it's for" })).toBeNull();
    expect(screen.getByText(/full sentence rather than a title/)).toBeVisible();
    await userEvent.type(screen.getByRole("textbox", { name: "Goal" }), text);
    expect(screen.queryByText(/full sentence rather than a title/)).toBeNull();
  });
});

describe("NewTask review", () => {
  test("every part arrives filled in from Bezl's read, each with where it came from", async () => {
    setup({ initial: { text, doneWhen: [] } });
    await next();
    expect(within(row("Who it's for")).getByText(read.who?.text ?? "")).toBeVisible();
    expect(within(row("Avoid or reuse")).getByText(read.avoid?.from ?? "")).toBeVisible();
    expect(within(row("It's done when")).getByText("3 lines, 2 checked by Bezl")).toBeVisible();
    expect(within(row("Crew")).getByText("Claude Code writes, Codex reviews")).toBeVisible();
    expect(within(row("Files")).getByText(read.files?.from ?? "")).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  test("the quick path: write the goal, then start with Bezl's read as it is", async () => {
    const { onStart } = setup();
    await userEvent.type(screen.getByRole("textbox", { name: "Goal" }), text);
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Start task" }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        writer: "claude",
        reviewer: "codex",
        paths: read.files?.paths,
        blockShip: false,
        setup: true,
      }),
    );
    expect(onStart.mock.calls[0]?.[0].draft.who).toBe(read.who?.text);
  });

  test("you change, drop or bring back any part, and your change sticks", async () => {
    setup({ initial: { text, doneWhen: [] } });
    await next();
    await change("Who it's for");
    const who = screen.getByRole("textbox", { name: "Who it's for" });
    await userEvent.clear(who);
    await userEvent.type(who, "Admins");
    await change("Example");
    await userEvent.click(screen.getByRole("button", { name: "Drop Example" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await next();
    expect(within(row("Who it's for")).getByText("Admins")).toBeVisible();
    expect(within(row("Example")).queryByText(read.example?.text ?? "")).toBeNull();
    await change("Example");
    await userEvent.click(screen.getByRole("button", { name: "Use Bezl's read for Example" }));
    expect(screen.getByRole("textbox", { name: "Example" })).toHaveValue(read.example?.text);
  });

  test("a line you type is yours to check, and you can remove any line", async () => {
    setup({ initial: { text, doneWhen: [] }, read: {}, step: "review" });
    await change("It's done when");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Add a line" }),
      "It feels calm{Enter}",
    );
    const list = screen.getByRole("list", { name: "Done-when lines" });
    expect(within(list).getByText("It feels calm")).toBeVisible();
    expect(within(list).getByText("You check")).toBeVisible();
    await userEvent.click(within(list).getByRole("button", { name: "Remove It feels calm" }));
    expect(screen.queryByRole("list", { name: "Done-when lines" })).toBeNull();
  });

  test("where Bezl couldn't tell, it says so, and you can start anyway", async () => {
    const { onStart } = setup({ initial: { text, doneWhen: [] }, read: {}, step: "review" });
    expect(screen.getAllByText(/Bezl couldn't tell from the goal or the code/).length).toBe(3);
    expect(screen.getByText(/Not filled in: who it's for/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Start anyway" }));
    expect(onStart).toHaveBeenCalledOnce();
  });
});

describe("NewTask setup", () => {
  test("Start names the setup it runs, and you can turn it off", async () => {
    const { onStart } = setup({ initial: { text, doneWhen: [] }, step: "review" });
    expect(within(row("Setup")).getByText("bun install")).toBeVisible();
    expect(screen.getByText(/Starting runs bun install in the task's copy/)).toBeVisible();
    await change("Setup");
    await userEvent.click(screen.getByRole("switch", { name: "Run setup when the task starts" }));
    expect(screen.queryByText(/Starting runs bun install/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Start task" }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ setup: false }));
  });

  test("a repository with no setup command has no setup row", () => {
    setup({ step: "review", setup: undefined });
    expect(screen.queryByRole("listitem", { name: "Setup" })).toBeNull();
  });
});

describe("NewTask crew", () => {
  test("offers what passed preflight and greys the rest with the reason", async () => {
    setup({ step: "review" });
    await change("Crew");
    // The name holds the visible word, so voice control can say it.
    expect(screen.getByRole("button", { name: "Done Crew" })).toHaveTextContent("Done");
    const writer = screen.getByRole("radiogroup", { name: "Writes" });
    expect(within(writer).getByRole("radio", { name: /Local model/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(within(writer).getByText(/can't write code/)).toBeVisible();
  });

  test("a reviewer from the writer's vendor is allowed and labelled", async () => {
    setup({ step: "review" });
    await change("Crew");
    const reviewer = screen.getByRole("radiogroup", { name: "Reviews" });
    expect(within(reviewer).queryByText(/same company/)).toBeNull();
    await userEvent.click(within(reviewer).getByRole("radio", { name: /Claude Code/ }));
    expect(
      within(reviewer).getByText("The writer and reviewer come from the same company"),
    ).toBeVisible();
  });
});

describe("NewTask from a GitHub issue", () => {
  test("picking an issue fills the goal, and its checklist becomes done-when lines", async () => {
    setup({ issues });
    await userEvent.click(screen.getByRole("button", { name: "Start from a GitHub issue" }));
    const list = screen.getByRole("list", { name: "Open issues in studio-web" });
    await userEvent.click(within(list).getByRole("button", { name: /#128/ }));
    expect(screen.getByRole("textbox", { name: "Goal" })).toHaveDisplayValue(
      /^Projects page shows an empty table/,
    );
    expect(screen.getByRole("link", { name: "View issue #128" })).toHaveAttribute(
      "href",
      "https://github.com/acme/studio-web/issues/128",
    );
    await next();
    expect(within(row("It's done when")).getByText(/^3 lines/)).toBeVisible();
  });

  test("the issue travels with the task, and you can start from scratch", async () => {
    const { onStart } = setup({ issues, pickedIssue: 128, step: "review" });
    await userEvent.click(screen.getByRole("button", { name: /^Start/ }));
    expect(onStart.mock.calls[0]?.[0].draft.issue).toEqual({
      number: 128,
      url: "https://github.com/acme/studio-web/issues/128",
    });
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Start from scratch" }));
    expect(screen.getByRole("textbox", { name: "Goal" })).toHaveValue("");
    expect(screen.queryByRole("link", { name: "View issue #128" })).toBeNull();
  });

  test("picking and clearing an issue keep what you wrote yourself", async () => {
    setup({ issues });
    await userEvent.click(screen.getByRole("button", { name: "Start from a GitHub issue" }));
    await userEvent.click(screen.getByRole("button", { name: /#128/ }));
    await next();
    await change("Who it's for");
    await userEvent.clear(screen.getByRole("textbox", { name: "Who it's for" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Who it's for" }), "Ops");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Start from scratch" }));
    expect(screen.getByRole("textbox", { name: "Goal" })).toHaveValue("");
    await next();
    expect(within(row("Who it's for")).getByText("Ops")).toBeVisible();
  });

  test("without GitHub issues, the goal starts empty and nothing offers them", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Start from a GitHub issue" })).toBeNull();
  });
});

describe("NewTask limits", () => {
  test("you add and remove the files it may change, and the task starts with yours", async () => {
    const { onStart } = setup({ initial: { text, doneWhen: [] }, step: "review" });
    await change("Files");
    const paths = () => screen.getByRole("list", { name: "Files it may change" });
    await userEvent.type(screen.getByRole("textbox", { name: "Add a path" }), "src/components/**");
    await userEvent.click(screen.getByRole("button", { name: "Add path" }));
    expect(within(paths()).getByText("src/components/**")).toBeVisible();
    await userEvent.click(
      within(paths()).getByRole("button", { name: "Remove src/pages/Projects.tsx" }),
    );
    await userEvent.click(
      within(paths()).getByRole("button", { name: "Remove src/pages/Projects.test.tsx" }),
    );
    expect(within(paths()).queryByText("src/pages/Projects.tsx")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^Start/ }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ paths: ["src/components/**"] }));
  });

  test("open problems do not block Ship unless you say so", async () => {
    setup({ step: "review" });
    await change("Files");
    expect(screen.getByRole("switch", { name: /Don't ship with open problems/ })).not.toBeChecked();
  });
});
