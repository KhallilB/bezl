import { invoke } from "@tauri-apps/api/core";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../../App";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

afterEach(() => {
  vi.mocked(invoke).mockReset();
  window.history.replaceState(null, "", "/");
});

// No spike config outside the spike build; preflight stays pending.
function noSpike() {
  vi.mocked(invoke).mockImplementation((cmd: string) =>
    cmd === "spike_config" ? Promise.reject("off") : new Promise(() => {}),
  );
}

describe("first screen", () => {
  test("the app opens on Providers, since there is no task list before M5", () => {
    noSpike();
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Providers" })).toBeVisible();
    expect(invoke).toHaveBeenCalledWith("providers_preflight");
  });

  test("?screen=task opens the sample Task screen, and ?sample= still picks its state", () => {
    noSpike();
    window.history.replaceState(null, "", "/?screen=task&sample=blocked");
    render(<App />);
    expect(screen.queryByRole("heading", { level: 1, name: "Providers" })).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith("providers_preflight");
    expect(screen.getByRole("region", { name: "Worker B" })).toBeVisible();
    expect(screen.getByText(/overwrite src\/policy\.rs\?/)).toBeVisible();
  });
});
