import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { steps } from "./tour";
import { Walkthrough } from "./Walkthrough";

function at(search: string) {
  window.history.replaceState(null, "", `/${search}`);
}

const dock = () => screen.getByRole("region", { name: "Walkthrough" });
const tasks = () => screen.getByRole("navigation", { name: "Tasks" });
const stageStrip = () => screen.getByRole("navigation", { name: "Stages" });
const total = steps.length;

beforeEach(() => {
  document.documentElement.dataset.theme = "dark";
  at("?screen=walkthrough");
});
afterEach(() => at(""));

describe("Walkthrough tour", () => {
  test("opens on the first step with its task, stage and status sentence", () => {
    render(<Walkthrough />);
    expect(within(dock()).getByText(`1 of ${total}`)).toBeVisible();
    expect(within(dock()).getByText("Every task in one list")).toBeVisible();
    expect(within(tasks()).getByRole("link", { current: "page" })).toHaveAccessibleName(
      /Empty state for Projects/,
    );
    expect(within(stageStrip()).getByRole("button", { current: "step" })).toHaveAccessibleName(
      "Review, needs you",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Empty state for Projects" }),
    ).toBeVisible();
  });

  test("Next and Back walk the steps and keep the URL in step", async () => {
    render(<Walkthrough />);
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(within(dock()).getByText(`2 of ${total}`)).toBeVisible();
    expect(within(stageStrip()).getByRole("button", { current: "step" })).toHaveAccessibleName(
      "Brief, done",
    );
    expect(window.location.search).toBe("?screen=walkthrough&step=stages&theme=dark");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(within(dock()).getByText(`1 of ${total}`)).toBeVisible();
  });

  test("arrow keys step, T flips the theme, modifiers are left alone", async () => {
    render(<Walkthrough />);
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(within(dock()).getByText(`3 of ${total}`)).toBeVisible();
    await userEvent.keyboard("{ArrowLeft}");
    expect(within(dock()).getByText(`2 of ${total}`)).toBeVisible();
    await userEvent.keyboard("t");
    expect(document.documentElement.dataset.theme).toBe("light");
    await userEvent.keyboard("{Meta>}{ArrowRight}{/Meta}");
    expect(within(dock()).getByText(`2 of ${total}`)).toBeVisible();
  });

  test("the contents menu jumps to any step", async () => {
    render(<Walkthrough />);
    await userEvent.click(screen.getByRole("button", { name: "Contents" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Problems first/ }));
    expect(within(dock()).getByText("Problems first")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Terminal snapshot" })).toBeVisible();
  });

  test("leaving restores the document theme", () => {
    at("?screen=walkthrough&theme=light");
    const { unmount } = render(<Walkthrough />);
    expect(document.documentElement.dataset.theme).toBe("light");
    unmount();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("Walkthrough free navigation", () => {
  test("a task in the list opens at its current stage", async () => {
    render(<Walkthrough />);
    await userEvent.click(within(tasks()).getByRole("link", { name: /Terminal snapshot/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Terminal snapshot" })).toBeVisible();
    expect(within(stageStrip()).getByRole("button", { current: "step" })).toHaveAccessibleName(
      "Check, failed",
    );
    expect(screen.getByText("2 things need a look.")).toBeVisible();
  });

  test("a stage in the strip opens its view", async () => {
    render(<Walkthrough />);
    await userEvent.click(within(stageStrip()).getByRole("button", { name: "Plan, done" }));
    expect(screen.getByText("Plan done.")).toBeVisible();
    expect(screen.getByText("Reuse EmptyState with one primary action")).toBeVisible();
  });

  test("the list names each task's light in words", () => {
    render(<Walkthrough />);
    expect(
      within(tasks()).getByRole("link", { name: "Deny empty scopes, needs you" }),
    ).toBeVisible();
    expect(
      within(tasks()).getByRole("link", { name: "Debounce terminal resize, working" }),
    ).toBeVisible();
  });
});

describe("Walkthrough design states", () => {
  test("a state step shows the interim Task screen in that state", () => {
    at("?screen=walkthrough&step=state-blocked");
    render(<Walkthrough />);
    const summary = screen.getByRole("list", { name: "Workers by state" });
    expect(within(summary).getByText("1 blocked")).toBeVisible();
  });

  test("the overview opens any state and theme full size", async () => {
    at("?screen=walkthrough&step=overview");
    render(<Walkthrough />);
    const cells = screen.getAllByRole("button", { name: /^Open / });
    expect(cells).toHaveLength(8);
    await userEvent.click(screen.getByRole("button", { name: "Open Long content, light" }));
    expect(within(dock()).getByText("Long content")).toBeVisible();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
