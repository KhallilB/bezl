import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { FacetedOperationsSkin } from "../skin/FacetedOperationsSkin";
import { ControlRoom } from "./ControlRoom";
import { blocked, idle, longContent, running, task } from "./fixtures";

const noop = () => {};

describe("ControlRoom", () => {
  test("renders one named region per worker, labelled by its header heading", () => {
    render(<ControlRoom task={task} workers={idle} onStop={noop} />);
    for (const worker of idle) {
      const region = screen.getByRole("region", { name: worker.name });
      const heading = within(region).getByRole("heading", { name: worker.name });
      expect(region).toHaveAttribute("aria-labelledby", heading.id);
      expect(heading.closest(".kb-panel-header")).not.toBeNull();
    }
  });

  test("draws every worker as a visible plane", () => {
    render(<ControlRoom task={task} workers={idle} onStop={noop} />);
    for (const worker of idle) {
      const region = screen.getByRole("region", { name: worker.name });
      expect(region).not.toHaveAttribute("data-tone", "quiet");
    }
  });

  test("makes the running worker the hero with elapsed time, step progress and an activity trace", () => {
    render(<ControlRoom task={task} workers={running} onStop={noop} />);
    const hero = screen.getByRole("region", { name: "Worker B" });
    expect(hero.closest("[data-hero]")).not.toBeNull();
    expect(screen.getByRole("region", { name: "Worker A" }).closest("[data-hero]")).toBeNull();
    expect(within(hero).getByText("04:12")).toBeVisible();
    const progress = within(hero).getByRole("progressbar", { name: "Step 3 of 5: cargo check" });
    expect(progress).toHaveAttribute("aria-valuenow", "3");
    expect(progress).toHaveAttribute("aria-valuemax", "5");
    expect(hero.querySelector('svg[data-part="trace"]')).toHaveAttribute("aria-hidden", "true");
  });

  test("does not repeat the hero's step as a summary line", () => {
    render(<ControlRoom task={task} workers={running} onStop={noop} />);
    const hero = screen.getByRole("region", { name: "Worker B" });
    expect(within(hero).queryByText("Step 3 of 5: cargo check.")).not.toBeInTheDocument();
  });

  test("leaves light to kbui's panel glow instead of drawing its own pools", () => {
    const { container } = render(<ControlRoom task={task} workers={blocked} onStop={noop} />);
    expect(container.querySelector(".cr-light")).toBeNull();
  });

  test("has no hero when nothing is running or blocked", () => {
    const { container } = render(<ControlRoom task={task} workers={idle} onStop={noop} />);
    expect(container.querySelector("[data-hero]")).toBeNull();
  });

  test("names each worker's role and provider above its title", () => {
    render(<ControlRoom task={task} workers={running} onStop={noop} />);
    const region = screen.getByRole("region", { name: "Worker B" });
    expect(within(region).getByText("Primary · Codex · writes")).toBeVisible();
    const reviewer = screen.getByRole("region", { name: "Worker A" });
    expect(within(reviewer).getByText("Reviewer · Claude Code · reads")).toBeVisible();
  });

  test("shows status chips for every worker and announces only the running one", () => {
    render(<ControlRoom task={task} workers={running} onStop={noop} />);
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
    render(<ControlRoom task={task} workers={blocked} onStop={noop} />);
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

  test("maps the task worktree and its workers in the banner orbit", () => {
    render(<ControlRoom task={task} workers={blocked} onStop={noop} />);
    expect(
      screen.getByRole("img", {
        name: "feat/policy-engine: Worker A reads, idle; Worker B writes, blocked; Worker C reads, finished",
      }),
    ).toBeVisible();
  });

  test("summarises worker states in the banner", () => {
    render(<ControlRoom task={task} workers={blocked} onStop={noop} />);
    // jsdom also maps each Panel.Header to banner, so find the page bar by its h1.
    const title = screen.getByRole("heading", { level: 1 });
    expect(title).toHaveTextContent("Control Room");
    const banner = title.closest("header") as HTMLElement;
    expect(banner.closest("section")).toBeNull();
    expect(within(banner).getByText("1 blocked")).toBeVisible();
    expect(within(banner).getByText("1 idle")).toBeVisible();
    expect(within(banner).getByText("1 finished")).toBeVisible();
    expect(within(banner).queryByText(/running/)).not.toBeInTheDocument();
  });

  test("puts output in a labelled, keyboard-scrollable well", () => {
    render(<ControlRoom task={task} workers={longContent} onStop={noop} />);
    const well = screen.getByRole("region", { name: "Worker B output" });
    expect(well).toHaveClass("kb-panel-well");
    const scroller = well.querySelector("pre");
    expect(scroller).toHaveAttribute("tabindex", "0");
    expect(scroller?.textContent?.length ?? 0).toBeGreaterThan(400);
  });

  test("shows branch and elapsed time in a non-hero footer", () => {
    render(<ControlRoom task={task} workers={running} onStop={noop} />);
    const region = screen.getByRole("region", { name: "Worker C" });
    const footer = region.querySelector(".kb-panel-footer");
    expect(footer).toHaveTextContent("feat/policy-engine");
    expect(footer).toHaveTextContent("00:42");
  });

  test("stop asks for confirmation and fires onStop only when confirmed", async () => {
    const onStop = vi.fn();
    render(<ControlRoom task={task} workers={running} onStop={onStop} />);
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
    "opens the stop dialog inside the skin root (skin=%s)",
    async (enabled) => {
      const { container } = render(
        <FacetedOperationsSkin enabled={enabled}>
          <ControlRoom task={task} workers={running} onStop={noop} />
        </FacetedOperationsSkin>,
      );
      await userEvent.click(screen.getByRole("button", { name: "Stop" }));
      const dialog = await screen.findByRole("dialog", { name: "Stop Worker B?" });
      expect(container.firstElementChild).toContainElement(dialog);
    },
  );

  test("idle and finished workers offer no stop control", () => {
    render(<ControlRoom task={task} workers={idle} onStop={noop} />);
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });
});
