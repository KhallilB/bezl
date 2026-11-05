import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { crew, issues, read } from "./fixtures";
import { NewTask, type NewTaskProps } from "./NewTask";

const text = "Help people with no projects start their first one.";
/** Bezl's read shows under the goal shortly after it has words. */
const next = () => screen.findByRole("list", { name: "Your task" });
const change = (part: string) =>
  userEvent.click(screen.getByRole("button", { name: `Change ${part}` }));
const row = (part: string) => screen.getByRole("listitem", { name: part });

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

describe("NewTask on one screen", () => {
  test("Bezl's read appears under the goal, and Start waits for a goal", async () => {
    setup();
    const start = screen.getByRole("button", { name: "Start task" });
    expect(start).toBeDisabled();
    expect(screen.queryByRole("list", { name: "Your task" })).toBeNull();
    await userEvent.type(screen.getByRole("textbox", { name: "Goal" }), text);
    await next();
    expect(screen.getByRole("textbox", { name: "Goal" })).toHaveValue(text);
    expect(screen.getByRole("button", { name: /^Start (task|anyway)$/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^Next|Back/ })).toBeNull();
  });

  test("the walkthrough can open with the read shown", () => {
    setup({ withRead: true });
    expect(screen.getByRole("list", { name: "Your task" })).toBeVisible();
  });

  test("with no agent that can write, Start is off and Coding agents is one click away", async () => {
    const onAgents = vi.fn();
    setup({
      withRead: true,
      providers: crew.map((p) => ({ ...p, canWrite: false })),
      onAgents,
    });
    expect(screen.getByText("No coding agent can write yet")).toBeVisible();
    expect(screen.getByRole("button", { name: /^Start (task|anyway)$/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Open Coding agents" }));
    expect(onAgents).toHaveBeenCalledOnce();
  });
});

describe("NewTask goal", () => {
  test("asks only for the goal, with no instructions to read", () => {
    setup();
    expect(screen.queryByRole("textbox", { name: "Who it's for" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Goal" })).not.toHaveAccessibleDescription();
  });
});

describe("NewTask review", () => {
  test("every part arrives filled in from Bezl's read; where it came from shows on Change", async () => {
    setup({ initial: { text, doneWhen: [] } });
    await next();
    expect(within(row("Who it's for")).getByText(read.who?.text ?? "")).toBeVisible();
    expect(within(row("Avoid or reuse")).queryByText(read.avoid?.from ?? "")).toBeNull();
    await change("Avoid or reuse");
    expect(within(row("Avoid or reuse")).getByText(read.avoid?.from ?? "")).toBeVisible();
    expect(within(row("It's done when")).getByText("3 lines, 2 checked by Bezl")).toBeVisible();
    expect(within(row("Crew")).getByText("Claude Code writes, Codex reviews")).toBeVisible();
    expect(within(row("Files")).getByText("Only 2 paths")).toBeVisible();
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
    expect(within(row("Who it's for")).getByText("Admins")).toBeVisible();
    expect(within(row("Example")).queryByText(read.example?.text ?? "")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Use Bezl's read for Example" }));
    expect(screen.getByRole("textbox", { name: "Example" })).toHaveValue(read.example?.text);
  });

  test("a line you type is yours to check, and you can remove any line", async () => {
    setup({ initial: { text, doneWhen: [] }, read: {}, withRead: true });
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
    const { onStart } = setup({ initial: { text, doneWhen: [] }, read: {}, withRead: true });
    expect(screen.getAllByText("Not found").length).toBe(3);
    await userEvent.click(screen.getByRole("button", { name: "Start anyway" }));
    expect(onStart).toHaveBeenCalledOnce();
  });
});

describe("NewTask setup", () => {
  test("the setup row names the command, and you can turn it off", async () => {
    const { onStart } = setup({ initial: { text, doneWhen: [] }, withRead: true });
    expect(within(row("Setup")).getByText("bun install")).toBeVisible();
    await change("Setup");
    await userEvent.click(screen.getByRole("switch", { name: "Run setup when the task starts" }));
    expect(within(row("Setup")).getByText("Skipped")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Start task" }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ setup: false }));
  });

  test("a repository with no setup command has no setup row", () => {
    setup({ withRead: true, setup: undefined });
    expect(screen.queryByRole("listitem", { name: "Setup" })).toBeNull();
  });
});

describe("NewTask crew", () => {
  test("offers what passed preflight and greys the rest with the reason", async () => {
    setup({ withRead: true });
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
    setup({ withRead: true });
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
    expect(screen.getByRole("link", { name: "issue #128" })).toHaveAttribute(
      "href",
      "https://github.com/acme/studio-web/issues/128",
    );
    await next();
    expect(within(row("It's done when")).getByText(/^3 lines/)).toBeVisible();
  });

  test("the issue travels with the task, and you can start from scratch", async () => {
    const { onStart } = setup({ issues, pickedIssue: 128, withRead: true });
    await userEvent.click(screen.getByRole("button", { name: /^Start (task|anyway)$/ }));
    expect(onStart.mock.calls[0]?.[0].draft.issue).toEqual({
      number: 128,
      url: "https://github.com/acme/studio-web/issues/128",
    });
    await userEvent.click(screen.getByRole("button", { name: "Start from scratch" }));
    expect(screen.getByRole("textbox", { name: "Goal" })).toHaveValue("");
    expect(screen.queryByRole("link", { name: "issue #128" })).toBeNull();
  });

  test("picking and clearing an issue keep what you wrote yourself", async () => {
    setup({ issues });
    await userEvent.click(screen.getByRole("button", { name: "Start from a GitHub issue" }));
    await userEvent.click(screen.getByRole("button", { name: /#128/ }));
    await next();
    await change("Who it's for");
    await userEvent.clear(screen.getByRole("textbox", { name: "Who it's for" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Who it's for" }), "Ops");
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
    const { onStart } = setup({ initial: { text, doneWhen: [] }, withRead: true });
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
    await userEvent.click(screen.getByRole("button", { name: /^Start (task|anyway)$/ }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ paths: ["src/components/**"] }));
  });

  test("open problems do not block Ship unless you say so", async () => {
    setup({ withRead: true });
    await change("Files");
    expect(screen.getByRole("switch", { name: /Don't ship with open problems/ })).not.toBeChecked();
  });
});
