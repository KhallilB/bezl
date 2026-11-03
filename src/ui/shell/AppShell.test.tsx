import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { AppShell } from "./AppShell";

const shell = (usage: { name: string; used: string }[]) =>
  render(
    <AppShell tasks={[]} usage={usage} onOpenTask={() => {}}>
      <p>page</p>
    </AppShell>,
  );

test("usage stays out of the way while every agent has room", () => {
  shell([
    { name: "Claude Code", used: "64%" },
    { name: "Codex", used: "22%" },
  ]);
  expect(screen.queryByRole("definition")).toBeNull();
});

test("an agent near its limit shows its usage, and only that one", () => {
  shell([
    { name: "Claude Code", used: "85%" },
    { name: "Codex", used: "22%" },
  ]);
  const usage = screen.getByLabelText("Coding agent usage");
  expect(within(usage).getByText("Claude Code")).toBeVisible();
  expect(within(usage).getByText("85%")).toBeVisible();
  expect(within(usage).queryByText("Codex")).toBeNull();
});
