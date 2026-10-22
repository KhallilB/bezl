import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { FacetedOperationsSkin } from "../skin/FacetedOperationsSkin";
import { ControlRoom } from "./ControlRoom";
import { blocked, idle, longContent, running } from "./fixtures";

const noop = () => {};

describe("ControlRoom", () => {
  test("renders one named region per worker, labelled by its header heading", () => {
    render(<ControlRoom workers={idle} onStop={noop} />);
    for (const worker of idle) {
      const region = screen.getByRole("region", { name: worker.name });
      const heading = within(region).getByRole("heading", { name: worker.name });
      expect(region).toHaveAttribute("aria-labelledby", heading.id);
      expect(heading.closest(".kb-facet-header")).not.toBeNull();
    }
  });

  test("draws every worker as a visible plane cut on both corners", () => {
    render(<ControlRoom workers={idle} onStop={noop} />);
    for (const worker of idle) {
      const region = screen.getByRole("region", { name: worker.name });
      expect(region).toHaveAttribute("data-cut", "both");
      expect(region).not.toHaveAttribute("data-tone", "quiet");
    }
  });

  test("names each worker's role and provider above its title", () => {
    render(<ControlRoom workers={running} onStop={noop} />);
    const region = screen.getByRole("region", { name: "Worker B" });
    expect(within(region).getByText("Primary · Codex")).toBeVisible();
  });

  test("shows status chips for every worker and announces only the running one", () => {
    render(<ControlRoom workers={running} onStop={noop} />);
    const live = screen.getAllByRole("status");
    expect(live).toHaveLength(1);
    expect(live[0]).toHaveTextContent("Running");
    for (const region of screen.getAllByRole("region", { name: /^Worker [A-C]$/ })) {
      expect(region.querySelector(".kb-facet-header .kb-status")).toHaveAttribute(
        "data-appearance",
        "chip",
      );
    }
  });

  test("maps worker state to facet tone and status tone", () => {
    render(<ControlRoom workers={blocked} onStop={noop} />);
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

  test("summarises worker states in the banner", () => {
    render(<ControlRoom workers={blocked} onStop={noop} />);
    // jsdom also maps each Facet.Header to banner, so find the page bar by its h1.
    const title = screen.getByRole("heading", { level: 1 });
    expect(title).toHaveTextContent("Control Room");
    const banner = title.closest("header") as HTMLElement;
    expect(banner.closest("section")).toBeNull();
    expect(within(banner).getByText("1 blocked")).toBeVisible();
    expect(within(banner).getByText("1 idle")).toBeVisible();
    expect(within(banner).getByText("1 finished")).toBeVisible();
    expect(within(banner).queryByText(/running/)).not.toBeInTheDocument();
  });

  test("puts output in a sunken, keyboard-scrollable well", () => {
    render(<ControlRoom workers={longContent} onStop={noop} />);
    const well = screen.getByRole("region", { name: "Worker B output" });
    expect(well).toHaveAttribute("data-tone", "sunken");
    const scroller = well.querySelector("pre");
    expect(scroller).toHaveAttribute("tabindex", "0");
    expect(scroller?.textContent?.length ?? 0).toBeGreaterThan(400);
  });

  test("shows branch and elapsed time in the footer", () => {
    render(<ControlRoom workers={running} onStop={noop} />);
    const region = screen.getByRole("region", { name: "Worker B" });
    const footer = region.querySelector(".kb-facet-footer");
    expect(footer).toHaveTextContent("feat/policy-engine");
    expect(footer).toHaveTextContent("04:12");
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

  test.each([true, false])(
    "opens the stop dialog inside the skin root (skin=%s)",
    async (enabled) => {
      const { container } = render(
        <FacetedOperationsSkin enabled={enabled}>
          <ControlRoom workers={running} onStop={noop} />
        </FacetedOperationsSkin>,
      );
      await userEvent.click(screen.getByRole("button", { name: "Stop" }));
      const dialog = await screen.findByRole("dialog", { name: "Stop Worker B?" });
      expect(container.firstElementChild).toContainElement(dialog);
    },
  );

  test("idle and finished workers offer no stop control", () => {
    render(<ControlRoom workers={idle} onStop={noop} />);
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });
});
