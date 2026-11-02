import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { crew, issues, suggestions } from "./fixtures";
import { NewTask, type NewTaskProps } from "./NewTask";
import { SetupConfirm } from "./SetupConfirm";

const text = "Help people with no projects start their first one.";

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

const readinessList = () => screen.getByRole("list", { name: "Is the task ready?" });
const check = (name: RegExp) => within(readinessList()).getByRole("listitem", { name });

describe("NewTask goal", () => {
  test("is checked as you type", async () => {
    setup();
    expect(check(/What you want/)).toHaveAccessibleDescription(/missing/);
    await userEvent.type(screen.getByRole("textbox", { name: "Goal" }), text);
    expect(check(/What you want/)).toHaveAccessibleDescription(/present/);
  });

  test("a gap says why and adds its suggestion in one click", async () => {
    setup({ initial: { text, doneWhen: [] } });
    expect(within(check(/Who it's for/)).getByText(/whose problem/)).toBeVisible();
    await userEvent.click(within(check(/Who it's for/)).getByRole("button", { name: /Add/ }));
    expect(check(/Who it's for/)).toHaveAccessibleDescription(/present/);
    expect(screen.getByText(suggestions.who?.who ?? "")).toBeVisible();
  });

  test("done checks say who checks each", async () => {
    setup({ initial: { text, doneWhen: [] } });
    await userEvent.click(within(check(/How you'll know/)).getByRole("button", { name: /Add/ }));
    const list = screen.getByRole("list", { name: "It's done when" });
    expect(within(list).getAllByText("Bezl checks").length).toBeGreaterThan(0);
    expect(within(list).getAllByText("You check").length).toBeGreaterThan(0);
  });

  test("starting anyway stays possible with gaps, and the label says so", async () => {
    const { onStart } = setup({ initial: { text, doneWhen: [] } });
    await userEvent.click(screen.getByRole("button", { name: "Start anyway" }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ writer: "claude", reviewer: "codex", blockShip: false }),
    );
  });
});

describe("NewTask crew", () => {
  test("offers what passed preflight and greys the rest with the reason", () => {
    setup();
    const writer = screen.getByRole("radiogroup", { name: "Writes" });
    expect(within(writer).getByRole("radio", { name: /Local model/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(within(writer).getByText(/can't write code/)).toBeVisible();
  });

  test("a reviewer from the writer's vendor is allowed and labelled", async () => {
    setup();
    const reviewer = screen.getByRole("radiogroup", { name: "Reviews" });
    expect(within(reviewer).queryByText(/same company/)).toBeNull();
    await userEvent.click(within(reviewer).getByRole("radio", { name: /Claude Code/ }));
    expect(
      within(reviewer).getByText("The writer and reviewer come from the same company"),
    ).toBeVisible();
  });

  test("open problems do not block Ship unless you say so", () => {
    setup();
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
  test("picking an issue fills the goal, which is checked like any other", async () => {
    setup({ issues });
    await userEvent.click(screen.getByRole("button", { name: "Start from a GitHub issue" }));
    const list = screen.getByRole("list", { name: "Open issues in studio-web" });
    await userEvent.click(within(list).getByRole("button", { name: /#128/ }));
    expect(screen.getByRole("textbox", { name: "Goal" })).toHaveDisplayValue(
      /^Projects page shows an empty table/,
    );
    expect(
      within(screen.getByRole("list", { name: "It's done when" })).getAllByRole("listitem"),
    ).toHaveLength(2);
    expect(check(/How you'll know it's done/)).toHaveAccessibleDescription(/present/);
    expect(check(/Who it's for/)).toHaveAccessibleDescription(/missing/);
    expect(screen.getByRole("link", { name: "View issue #128" })).toHaveAttribute(
      "href",
      "https://github.com/acme/studio-web/issues/128",
    );
  });

  test("the issue travels with the task, and you can start from scratch", async () => {
    const { onStart } = setup({ issues, pickedIssue: 128 });
    await userEvent.click(screen.getByRole("button", { name: "Start anyway" }));
    expect(onStart.mock.calls[0]?.[0].draft.issue).toEqual({
      number: 128,
      url: "https://github.com/acme/studio-web/issues/128",
    });
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
    const { onStart } = setup({ initial: { text, doneWhen: [] } });
    const paths = () => screen.getByRole("list", { name: "Files it may change" });
    await userEvent.type(screen.getByRole("textbox", { name: "Add a path" }), "src/components/**");
    await userEvent.click(screen.getByRole("button", { name: "Add path" }));
    expect(within(paths()).getByText("src/components/**")).toBeVisible();
    await userEvent.click(
      within(paths()).getByRole("button", { name: "Remove src/pages/Projects.tsx" }),
    );
    expect(within(paths()).queryByText("src/pages/Projects.tsx")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Start/ }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ paths: ["src/components/**"] }));
  });
});
