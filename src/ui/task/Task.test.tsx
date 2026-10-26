import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { AppTheme } from "../theme/AppTheme";
import { blocked, idle, longContent, running, task } from "./fixtures";
import { Task } from "./Task";

const noop = () => {};

describe("Task", () => {
  test("renders one named region per worker, labelled by its header heading", () => {
    render(<Task task={task} workers={idle} onStop={noop} />);
    for (const worker of idle) {
      const region = screen.getByRole("region", { name: worker.name });
      const heading = within(region).getByRole("heading", { name: worker.name });
      expect(region).toHaveAttribute("aria-labelledby", heading.id);
      expect(heading.closest(".kb-panel-header")).not.toBeNull();
    }
  });

  test("draws every worker as a visible plane", () => {
    render(<Task task={task} workers={idle} onStop={noop} />);
    for (const worker of idle) {
      const region = screen.getByRole("region", { name: worker.name });
      expect(region).not.toHaveAttribute("data-tone", "quiet");
    }
  });

  test("makes the running worker the focused worker with elapsed time, step progress and an activity trace", () => {
    render(<Task task={task} workers={running} onStop={noop} />);
    const focused = screen.getByRole("region", { name: "Worker B" });
    expect(focused.closest("[data-focused]")).not.toBeNull();
    expect(screen.getByRole("region", { name: "Worker A" }).closest("[data-focused]")).toBeNull();
    expect(within(focused).getByText("04:12")).toBeVisible();
    expect(within(focused).getByText("04:12").closest(".kb-stat")).toHaveAttribute(
      "data-size",
      "display",
    );
    expect(within(focused).getByText("Elapsed")).toBeVisible();
    const progress = within(focused).getByRole("progressbar", { name: "cargo check" });
    expect(progress.closest(".kb-progress")).not.toBeNull();
    expect(progress).toHaveAttribute("aria-valuenow", "3");
    expect(progress).toHaveAttribute("aria-valuemax", "5");
    expect(progress).toHaveAttribute("aria-valuetext", "Step 3 of 5");
    expect(focused.querySelector('svg[data-part="trace"]')).toHaveAttribute("aria-hidden", "true");
  });

  test("does not repeat the focused worker's step as a summary line", () => {
    render(<Task task={task} workers={running} onStop={noop} />);
    const focused = screen.getByRole("region", { name: "Worker B" });
    expect(within(focused).queryByText("Step 3 of 5: cargo check.")).not.toBeInTheDocument();
  });

  test("leaves light to kbui's panel glow instead of drawing its own pools", () => {
    const { container } = render(<Task task={task} workers={blocked} onStop={noop} />);
    expect(container.querySelector(".task-light")).toBeNull();
  });

  test("has no focused worker when nothing is running or blocked", () => {
    const { container } = render(<Task task={task} workers={idle} onStop={noop} />);
    expect(container.querySelector("[data-focused]")).toBeNull();
  });

  test("names each worker's role and provider above its title", () => {
    render(<Task task={task} workers={running} onStop={noop} />);
    const region = screen.getByRole("region", { name: "Worker B" });
    const eyebrow = within(region).getByText("Primary · Codex · writes");
    expect(eyebrow).toBeVisible();
    expect(eyebrow.closest(".kb-badge")).toHaveAttribute("data-appearance", "plain");
    expect(eyebrow.closest(".kb-badge")).toHaveAttribute("data-mono");
    const reviewer = screen.getByRole("region", { name: "Worker A" });
    expect(within(reviewer).getByText("Reviewer · Claude Code · reads")).toBeVisible();
  });

  test("shows status chips for every worker and announces only the running one", () => {
    render(<Task task={task} workers={running} onStop={noop} />);
    const live = screen.getAllByRole("status");
    expect(live).toHaveLength(1);
    expect(live[0]).toHaveTextContent("Running");
    for (const region of screen.getAllByRole("region", { name: /^Worker [A-C]$/ })) {
      expect(region.querySelector(".kb-panel-header .kb-status")).toHaveAttribute(
        "data-appearance",
        "chip",
      );
    }
  });

  test("maps worker state to panel tone and status tone", () => {
    render(<Task task={task} workers={blocked} onStop={noop} />);
    const blockedRegion = screen.getByRole("region", { name: "Worker B" });
    expect(blockedRegion).toHaveAttribute("data-tone", "critical");
    expect(within(blockedRegion).getByText("Blocked").closest(".kb-status")).toHaveAttribute(
      "data-tone",
      "blocked",
    );
    expect(screen.getByRole("region", { name: "Worker A" })).toHaveAttribute(
      "data-tone",
      "default",
    );
  });

  test("maps the task worktree and its workers in the worker map", () => {
    render(<Task task={task} workers={blocked} onStop={noop} />);
    expect(
      screen.getByRole("img", {
        name: "Task feat/policy-engine: Worker A reads, idle; Worker B writes, blocked; Worker C reads, finished",
      }),
    ).toBeVisible();
  });

  test("summarises worker states in the task header", () => {
    render(<Task task={task} workers={blocked} onStop={noop} />);
    // jsdom also maps each Panel.Header to banner, so find the task header by its h1.
    const title = screen.getByRole("heading", { level: 1 });
    expect(title).toHaveTextContent("Task feat/policy-engine");
    const header = title.closest("header") as HTMLElement;
    expect(header.closest("section")).toBeNull();
    expect(within(header).getByText("1 blocked")).toBeVisible();
    expect(within(header).getByText("1 idle")).toBeVisible();
    expect(within(header).getByText("1 finished")).toBeVisible();
    expect(within(header).queryByText(/running/)).not.toBeInTheDocument();
  });

  test("puts output in a labelled, keyboard-scrollable well", () => {
    render(<Task task={task} workers={longContent} onStop={noop} />);
    const well = screen.getByRole("region", { name: "Worker B output" });
    expect(well.closest(".kb-scrollarea")).not.toBeNull();
    expect(well.closest(".kb-panel-well")).not.toBeNull();
    expect(well).toHaveAttribute("tabindex", "0");
    expect(well.textContent?.length ?? 0).toBeGreaterThan(400);
  });

  test("shows branch and elapsed time in an unfocused worker's footer", () => {
    render(<Task task={task} workers={running} onStop={noop} />);
    const region = screen.getByRole("region", { name: "Worker C" });
    const footer = region.querySelector(".kb-panel-footer");
    expect(footer).toHaveTextContent("feat/policy-engine");
    expect(footer).toHaveTextContent("00:42");
    // kbui's case-preserving mono Badge, so branch names render as written.
    const meta = footer?.querySelector(".kb-badge[data-mono][data-preserve-case]");
    expect(meta).toHaveTextContent("feat/policy-engine");
  });

  test("stop asks for confirmation and fires onStop only when confirmed", async () => {
    const onStop = vi.fn();
    render(<Task task={task} workers={running} onStop={onStop} />);
    const region = screen.getByRole("region", { name: "Worker B" });
    await userEvent.click(within(region).getByRole("button", { name: "Stop" }));
    const dialog = await screen.findByRole("dialog", { name: "Stop Worker B?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep going" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onStop).not.toHaveBeenCalled();

    await userEvent.click(within(region).getByRole("button", { name: "Stop" }));
    const again = await screen.findByRole("dialog", { name: "Stop Worker B?" });
    await userEvent.click(within(again).getByRole("button", { name: "Stop worker" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onStop).toHaveBeenCalledWith("b");
  });

  test.each([true, false])(
    "opens the stop dialog inside the theme root (theme=%s)",
    async (enabled) => {
      const { container } = render(
        <AppTheme enabled={enabled}>
          <Task task={task} workers={running} onStop={noop} />
        </AppTheme>,
      );
      await userEvent.click(screen.getByRole("button", { name: "Stop" }));
      const dialog = await screen.findByRole("dialog", { name: "Stop Worker B?" });
      expect(container.firstElementChild).toContainElement(dialog);
    },
  );

  test("idle and finished workers offer no stop control", () => {
    render(<Task task={task} workers={idle} onStop={noop} />);
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });
});
