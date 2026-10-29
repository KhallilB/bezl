import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { codexFound, thisMachine } from "./fixtures";
import { Providers } from "./Providers";

describe("Providers", () => {
  test("shows a found CLI's path, version and that its sign-in is not checked yet", () => {
    render(<Providers checks={thisMachine} />);
    const claude = screen.getByRole("region", { name: "Claude Code" });
    expect(within(claude).getByText("Found")).toBeVisible();
    expect(within(claude).getByText("/Users/me/.local/bin/claude")).toBeVisible();
    expect(within(claude).getByText("2.1.312")).toBeVisible();
    expect(within(claude).getByText("Not checked yet")).toBeVisible();
  });

  test("keeps one heading outline: screen, provider, rejected", () => {
    render(<Providers checks={[codexFound]} />);
    expect(screen.getByRole("heading", { level: 1, name: "Providers" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Codex" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Rejected" })).toBeVisible();
  });

  test("shows a rejected binary with what its version output says", () => {
    render(<Providers checks={thisMachine} />);
    const codex = screen.getByRole("region", { name: "Codex" });
    expect(within(codex).getByText("Not found")).toBeVisible();
    const rejected = within(codex).getByRole("list", { name: "Rejected binaries" });
    const item = within(rejected).getByRole("listitem");
    expect(within(item).getByText("/Users/me/.bun/bin/codex")).toBeVisible();
    expect(item).toHaveTextContent('Says "0.2.3"');
    expect(within(codex).queryByRole("list", { name: "Sign-in" })).toBeNull();
  });

  test("shows Codex sign-in for each home", () => {
    render(<Providers checks={[codexFound]} />);
    const signin = screen.getByRole("list", { name: "Sign-in" });
    const items = within(signin).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const [operator, workers] = items as [HTMLElement, HTMLElement];
    expect(operator).toHaveTextContent("Your Codex home");
    expect(operator).toHaveTextContent("/Users/me/.codex");
    expect(within(operator).getByText("Signed in with ChatGPT")).toBeVisible();
    expect(workers).toHaveTextContent("Workers' Codex home");
    expect(within(workers).getByText("Signed out")).toBeVisible();
  });

  test("says why each rejected binary was rejected", () => {
    render(<Providers checks={[codexFound]} />);
    const items = within(screen.getByRole("list", { name: "Rejected binaries" })).getAllByRole(
      "listitem",
    );
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining('Says "0.2.3"'),
      expect.stringContaining('Exited with code 2: "boom"'),
    ]);
  });

  test("shows a failed preflight as an error, and a pending one as checking", () => {
    const { rerender } = render(<Providers checks={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking agent CLIs…");
    rerender(<Providers checks={null} error="spawn failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("spawn failed");
  });
});
