import { invoke } from "@tauri-apps/api/core";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../../App";

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage = () => {};
  },
  invoke: vi.fn(() => new Promise(() => {})),
}));

// jsdom has neither; xterm needs both to mount.
window.matchMedia ??= (() => ({ matches: false, addListener() {}, removeListener() {} })) as never;
globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
} as never;

afterEach(() => {
  vi.mocked(invoke).mockClear();
  window.history.replaceState(null, "", "/");
});

test("?screen=terminals opens three login shells side by side", () => {
  window.history.replaceState(null, "", "/?screen=terminals");
  render(<App />);
  expect(screen.getByRole("heading", { level: 1, name: "Terminals" })).toBeVisible();
  expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
    "Shell 1",
    "Shell 2",
    "Shell 3",
  ]);
  expect(invoke).not.toHaveBeenCalledWith("providers_preflight");
});
