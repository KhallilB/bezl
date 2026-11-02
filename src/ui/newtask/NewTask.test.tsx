import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { crew, issues, suggestions } from "./fixtures";
import { NewTask, type NewTaskProps } from "./NewTask";
import { SetupConfirm } from "./SetupConfirm";

const text = "Help people with no projects start their first one.";
const next = () => userEvent.click(screen.getByRole("button", { name: /^Next/ }));
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
      suggestions={suggestions}
      providers={crew}
      paths={["src/pages/Projects.tsx"]}
      onStart={onStart}
      {...props}
    />,
  );
  return { onStart };
}

describe("NewTask steps", () => {
  test("walks Goal, Done when, then Who works on it, and Back keeps what you wrote", async () => {
    setup();
    expect(stepNow()).toHaveTextContent("Goal");
    await userEvent.type(screen.getByRole("textbox", { name: "Goal" }), text);
    await next();
    expect(stepNow()).toHaveTextContent("Done when");
    expect(screen.queryByRole("textbox", { name: "Goal" })).toBeNull();
    await next();
    expect(stepNow()).toHaveTextContent("Who works on it");
    expect(screen.getByRole("radiogroup", { name: "Writes" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("textbox", { name: "Goal" })).toHaveValue(text);
  });

  test("the walkthrough can open on a later step", () => {
    setup({ step: "who" });
    expect(stepNow()).toHaveTextContent("Who works on it");
  });
});

describe("NewTask goal", () => {
  test("a short goal says why a sentence helps", async () => {
    setup();
    expect(screen.getByText(/full sentence rather than a title/)).toBeVisible();
    await userEvent.type(screen.getByRole("textbox", { name: "Goal" }), text);
    expect(screen.queryByText(/full sentence rather than a title/)).toBeNull();
  });

  test("the optional parts are fields, each with its suggestion one click away", async () => {
    setup({ initial: { text, doneWhen: [] } });
    const who = screen.getByRole("textbox", { name: "Who it's for" });
    expect(screen.getByText(/whose problem/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Use suggestion for Who it's for" }));
    expect(who).toHaveValue(suggestions.who?.who);
    await userEvent.clear(screen.getByRole("textbox", { name: "Example" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Example" }), "The Inbox page");
    expect(screen.getByRole("textbox", { name: "Example" })).toHaveValue("The Inbox page");
  });
});

describe("NewTask done when", () => {
  test("each line says who checks it, and suggested lines add in one click", async () => {
    setup({ initial: { text, doneWhen: [] }, step: "done" });
    expect(screen.getByText(/take the agent's word/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Add 3 suggested lines/ }));
    const list = screen.getByRole("list", { name: "It's done when" });
    expect(within(list).getAllByText("Bezl checks").length).toBeGreaterThan(0);
    expect(within(list).getAllByText("You check").length).toBeGreaterThan(0);
  });

  test("a line you type is yours to check, and you can remove it", async () => {
    setup({ initial: { text, doneWhen: [] }, step: "done" });
    await userEvent.type(
      screen.getByRole("textbox", { name: "Add a line" }),
      "It feels calm{Enter}",
    );
    const list = screen.getByRole("list", { name: "It's done when" });
    expect(within(list).getByText("It feels calm")).toBeVisible();
    expect(within(list).getByText("You check")).toBeVisible();
    await userEvent.click(within(list).getByRole("button", { name: "Remove It feels calm" }));
    expect(screen.queryByRole("list", { name: "It's done when" })).toBeNull();
  });
});

describe("NewTask start", () => {
  test("the last step sums up the task and names any gaps; you can start anyway", async () => {
    const { onStart } = setup({ initial: { text, doneWhen: [] }, step: "who" });
    const summary = screen.getByRole("region", { name: "Your task" });
    expect(within(summary).getByText(text)).toBeVisible();
    expect(within(summary).getByText(/Not filled in: who it's for/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Start anyway" }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ writer: "claude", reviewer: "codex", blockShip: false }),
    );
  });
});

describe("NewTask crew", () => {
  test("offers what passed preflight and greys the rest with the reason", () => {
    setup({ step: "who" });
    const writer = screen.getByRole("radiogroup", { name: "Writes" });
    expect(within(writer).getByRole("radio", { name: /Local model/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(within(writer).getByText(/can't write code/)).toBeVisible();
  });

  test("a reviewer from the writer's vendor is allowed and labelled", async () => {
    setup({ step: "who" });
    const reviewer = screen.getByRole("radiogroup", { name: "Reviews" });
    expect(within(reviewer).queryByText(/same company/)).toBeNull();
    await userEvent.click(within(reviewer).getByRole("radio", { name: /Claude Code/ }));
    expect(
      within(reviewer).getByText("The writer and reviewer come from the same company"),
    ).toBeVisible();
  });

  test("open problems do not block Ship unless you say so", () => {
    setup({ step: "who" });
    expect(screen.getByRole("switch", { name: /Don't ship with open problems/ })).not.toBeChecked();
  });
});

describe("SetupConfirm", () => {
  test("names the command and waits for your answer", async () => {
    const onAllow = vi.fn();
    const onDeny = vi.fn();
    render(
      <SetupConfirm repo="studio-web" command="bun install" onAllow={onAllow} onDeny={onDeny} />,
    );
    expect(screen.getByText("bun install")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(onAllow).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(onDeny).toHaveBeenCalledOnce();
  });

  test("Deny stops with the reason and what you can do next", async () => {
    const onAllow = vi.fn();
    const onEditGoal = vi.fn();
    render(
      <SetupConfirm
        repo="studio-web"
        command="bun install"
        onAllow={onAllow}
        onDeny={() => {}}
        onEditGoal={onEditGoal}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(screen.getByRole("heading", { level: 1, name: "Setup denied" })).toBeVisible();
    expect(screen.getByText(/Nothing ran in the task's copy/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Deny" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Edit the goal" }));
    expect(onEditGoal).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Allow setup" }));
    expect(onAllow).toHaveBeenCalledWith(false);
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
    expect(
      within(screen.getByRole("list", { name: "It's done when" })).getAllByRole("listitem"),
    ).toHaveLength(2);
  });

  test("the issue travels with the task, and you can start from scratch", async () => {
    const { onStart } = setup({ issues, pickedIssue: 128, step: "who" });
    await userEvent.click(screen.getByRole("button", { name: "Start anyway" }));
    expect(onStart.mock.calls[0]?.[0].draft.issue).toEqual({
      number: 128,
      url: "https://github.com/acme/studio-web/issues/128",
    });
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Start from scratch" }));
    expect(screen.getByRole("textbox", { name: "Goal" })).toHaveValue("");
    expect(screen.queryByRole("link", { name: "View issue #128" })).toBeNull();
  });

  test("without GitHub issues, the goal starts empty and nothing offers them", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Start from a GitHub issue" })).toBeNull();
  });
});

describe("NewTask limits", () => {
  test("you add and remove the files it may change, and the task starts with yours", async () => {
    const { onStart } = setup({ initial: { text, doneWhen: [] }, step: "who" });
    const paths = () => screen.getByRole("list", { name: "Files it may change" });
    await userEvent.type(screen.getByRole("textbox", { name: "Add a path" }), "src/components/**");
    await userEvent.click(screen.getByRole("button", { name: "Add path" }));
    expect(within(paths()).getByText("src/components/**")).toBeVisible();
    await userEvent.click(
      within(paths()).getByRole("button", { name: "Remove src/pages/Projects.tsx" }),
    );
    expect(within(paths()).queryByText("src/pages/Projects.tsx")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^Start/ }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ paths: ["src/components/**"] }));
  });
});
