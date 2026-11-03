import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Lines } from "./Lines";
import type { LineEntry, Shot } from "./model";
import { useDesign } from "./Preview";

const shot = (id: string): Shot => ({
  id,
  name: `Shot ${id}`,
  screen: id === "a" ? "Settings" : "Projects",
  from: "Claude Code",
  commit: "4e1c2b9",
  images: { phone: `${id}.jpg`, desktop: `${id}.jpg` },
});

const entry = (key: string, title: string, shots: string[]): LineEntry => ({
  key,
  title,
  light: "done",
  questions: [],
  answered: [],
  problems: [],
  shots,
  code: [],
  ran: [],
  claimed: false,
  files: [],
  checks: [],
});

const entries = [entry("line-0", "Shows a", ["a"]), entry("line-1", "Shows b", ["b"])];

function Harness({ start = "line-1" }: { start?: string }) {
  const shots = [shot("a"), shot("b")];
  const design = useDesign(shots);
  const [picked, setPicked] = useState(start);
  return (
    <Lines
      entries={entries}
      picked={picked}
      onPick={setPicked}
      decisions={[]}
      assumptions={[]}
      raised={new Set()}
      shots={shots}
      example={null}
      design={design}
      prefer={null}
      onAnswer={vi.fn()}
      onExample={vi.fn()}
    />
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("a line's screenshots", () => {
  test("a line shows only its own screenshot, never another line's", () => {
    render(<Harness />);
    const pane = screen.getByRole("region", { name: "Shows b" });
    expect(within(pane).getByRole("img", { name: /Shot b/ })).toBeVisible();
    expect(within(pane).queryByRole("img", { name: /Shot a/ })).toBeNull();
    expect(within(pane).queryByRole("toolbar", { name: "Screenshot" })).toBeNull();
  });
});

describe("focus", () => {
  test("resizing across the breakpoint leaves focus where it is", async () => {
    let resize = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          resize = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    let width = 1200;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ width }) as DOMRect,
    );
    render(<Harness />);
    const row = (name: string) => screen.getByRole("button", { name: new RegExp(name) });
    await userEvent.click(row("Shows a"));
    expect(document.activeElement).toHaveTextContent("Shows a");
    row("Shows b").focus();
    for (const w of [400, 1200]) {
      width = w;
      act(() => resize());
    }
    expect(row("Shows b")).toHaveFocus();
    vi.restoreAllMocks();
  });
});
