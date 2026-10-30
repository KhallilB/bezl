import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { crew, suggestions } from "./fixtures";
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

const readinessList = () => screen.getByRole("list", { name: "Brief readiness" });
const check = (name: RegExp) => within(readinessList()).getByRole("listitem", { name });

describe("NewTask brief", () => {
  test("is checked as you type", async () => {
    setup();
    expect(check(/What you want/)).toHaveAccessibleDescription(/missing/);
    await userEvent.type(screen.getByRole("textbox", { name: "Brief" }), text);
    expect(check(/What you want/)).toHaveAccessibleDescription(/present/);
  });

  test("a gap says why and adds its suggestion in one click", async () => {
    setup({ initial: { text, doneWhen: [] } });
    expect(within(check(/Who it is for/)).getByText(/whose problem/)).toBeVisible();
    await userEvent.click(within(check(/Who it is for/)).getByRole("button", { name: /Add/ }));
    expect(check(/Who it is for/)).toHaveAccessibleDescription(/present/);
    expect(screen.getByText(suggestions.who?.who ?? "")).toBeVisible();
  });

  test("done-when items say who checks each", async () => {
    setup({ initial: { text, doneWhen: [] } });
    await userEvent.click(within(check(/How you will know/)).getByRole("button", { name: /Add/ }));
    const list = screen.getByRole("list", { name: "Done when" });
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
    expect(within(writer).getByText(/no tools to write with/)).toBeVisible();
  });

  test("a reviewer from the writer's vendor is allowed and labelled", async () => {
    setup();
    const reviewer = screen.getByRole("radiogroup", { name: "Reviews" });
    expect(within(reviewer).queryByText(/same provider/)).toBeNull();
    await userEvent.click(within(reviewer).getByRole("radio", { name: /Claude Code/ }));
    expect(within(reviewer).getByText("Reviewed by the same provider that wrote it")).toBeVisible();
  });

  test("open problems do not block Ship unless you say so", () => {
    setup();
    expect(screen.getByRole("switch", { name: /Open problems block Ship/ })).not.toBeChecked();
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
});
