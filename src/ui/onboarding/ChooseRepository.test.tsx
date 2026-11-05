import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ChooseRepository } from "./ChooseRepository";

test("asks for a repository with one action", async () => {
  const onChoose = vi.fn();
  render(<ChooseRepository onChoose={onChoose} />);
  expect(screen.getByRole("heading", { level: 1, name: "Open a repository" })).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Choose a folder" }));
  expect(onChoose).toHaveBeenCalledOnce();
});

test("a refused folder says which and why, and the action stays", () => {
  render(
    <ChooseRepository
      onChoose={() => {}}
      refused={{ path: "~/Downloads", reason: "Not a git repository" }}
    />,
  );
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("Not a git repository");
  expect(alert).toHaveTextContent("~/Downloads");
  expect(screen.getByRole("button", { name: "Choose a folder" })).toBeEnabled();
});
