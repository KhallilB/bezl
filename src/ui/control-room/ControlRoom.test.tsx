import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ControlRoom } from "./ControlRoom";
import { blocked, idle, longContent, running } from "./fixtures";

describe("ControlRoom", () => {
  test("renders one named region per worker, labelled by its header heading", () => {
    render(<ControlRoom workers={idle} onStop={() => {}} />);
    for (const worker of idle) {
      const region = screen.getByRole("region", { name: worker.name });
      const heading = within(region).getByRole("heading", { name: worker.name });
      expect(region).toHaveAttribute("aria-labelledby", heading.id);
      expect(heading.closest(".kb-facet-header")).not.toBeNull();
    }
  });

  test("shows status text for every worker and announces only the running one", () => {
    render(<ControlRoom workers={running} onStop={() => {}} />);
    const live = screen.getAllByRole("status");
    expect(live).toHaveLength(1);
    expect(live[0]).toHaveTextContent("Running");
    expect(screen.getByText("Idle")).toBeVisible();
    expect(screen.getByText("Finished")).toBeVisible();
  });

  test("maps worker state to facet tone and status tone", () => {
    render(<ControlRoom workers={blocked} onStop={() => {}} />);
    const blockedRegion = screen.getByRole("region", { name: "Worker B" });
    expect(blockedRegion).toHaveAttribute("data-tone", "critical");
    expect(within(blockedRegion).getByText("Blocked").closest(".kb-status")).toHaveAttribute(
      "data-tone",
      "blocked",
    );
    const idleRegion = screen.getByRole("region", { name: "Worker A" });
    expect(idleRegion).toHaveAttribute("data-tone", "quiet");
  });

  test("stop asks for confirmation and fires onStop only when confirmed", async () => {
    const onStop = vi.fn();
    render(<ControlRoom workers={running} onStop={onStop} />);
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

  test("idle and finished workers offer no stop control", () => {
    render(<ControlRoom workers={idle} onStop={() => {}} />);
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });

  test("long transcripts stay inside the worker's body", () => {
    render(<ControlRoom workers={longContent} onStop={() => {}} />);
    const region = screen.getByRole("region", { name: "Worker B" });
    const body = region.querySelector(".kb-facet-body");
    expect(body?.textContent?.length ?? 0).toBeGreaterThan(400);
  });
});
