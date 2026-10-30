import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { history } from "./fixtures";
import { HistoryPage } from "./HistoryPage";

function open() {
  const onBack = vi.fn();
  render(<HistoryPage history={history} onBack={onBack} />);
  return { onBack };
}

describe("HistoryPage", () => {
  test("the timeline lists every event in order, with when and who", () => {
    open();
    const items = within(screen.getByRole("list", { name: "Timeline" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/10:02.*You.*Started the task/);
    expect(items.at(-1)).toHaveTextContent(/You.*Kept take A/);
  });

  test("your minutes sit beside the agents' time and tokens", () => {
    open();
    const cost = screen.getByRole("list", { name: "Time spent" });
    expect(within(cost).getByText("Your time")).toBeVisible();
    expect(within(cost).getByText("9 min")).toBeVisible();
    expect(within(cost).getByText("Agents")).toBeVisible();
  });

  test("each worker's changes are listed", () => {
    open();
    expect(screen.getByRole("list", { name: "Files take A changed" })).toBeVisible();
    expect(screen.getByRole("list", { name: "Files take B changed" })).toBeVisible();
  });

  test("a terminal snapshot opens in the viewer", async () => {
    open();
    await userEvent.click(
      screen.getAllByRole("button", { name: /Open snapshot/ })[0] as HTMLElement,
    );
    const viewer = await screen.findByRole("dialog", { name: /Snapshot · take A/ });
    expect(within(viewer).getByText(/48 passed/)).toBeVisible();
  });

  test("Back returns to the task", async () => {
    const { onBack } = open();
    await userEvent.click(screen.getByRole("button", { name: "Back to task" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
