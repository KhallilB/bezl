import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { blocked, running, task } from "./fixtures";
import { WorkerMap } from "./WorkerMap";

describe("WorkerMap", () => {
  test("summarises the task worktree and every worker in its accessible name", () => {
    render(<WorkerMap task={task} workers={running} />);
    expect(
      screen.getByRole("img", {
        name: "Task feat/policy-engine: Worker A reads, idle; Worker B writes, running; Worker C reads, finished",
      }),
    ).toBeInTheDocument();
  });

  test("draws a write edge to the primary and read edges to reviewers", () => {
    const { container } = render(<WorkerMap task={task} workers={running} />);
    const edge = (id: string) => container.querySelector(`[data-edge="${id}"]`);
    expect(edge("b")).toHaveAttribute("data-access", "write");
    expect(edge("a")).toHaveAttribute("data-access", "read");
    expect(edge("c")).toHaveAttribute("data-access", "read");
  });

  test("marks each node with its worker state", () => {
    const { container } = render(<WorkerMap task={task} workers={blocked} />);
    expect(container.querySelector('[data-node="b"]')).toHaveAttribute("data-state", "blocked");
    expect(container.querySelector('[data-node="a"]')).toHaveAttribute("data-state", "idle");
  });

  test("labels the hub with the task branch", () => {
    const { container } = render(<WorkerMap task={task} workers={running} />);
    expect(container.querySelector("[data-hub]")).toHaveTextContent("feat/policy-engine");
  });

  test("sends no packet along the write edge unless the primary is running", () => {
    const view = render(<WorkerMap task={task} workers={blocked} />);
    expect(view.container.querySelector("[data-packet]")).toBeNull();
  });
});
