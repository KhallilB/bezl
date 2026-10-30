import * as samples from "../task/fixtures";
import type { WorkerView } from "../task/model";

export const scenes = ["idle", "running", "blocked", "longContent"] as const;
export type Scene = (typeof scenes)[number];

export const themes = ["dark", "light"] as const;
export type Theme = (typeof themes)[number];

export const sceneLabel: Record<Scene, string> = {
  idle: "Idle",
  running: "Running",
  blocked: "Blocked",
  longContent: "Long content",
};

export const sceneNote: Record<Scene, string> = {
  idle: "No task running; every worker waits.",
  running: "The writer works while reviewers wait or finish.",
  blocked: "The writer waits for your answer.",
  longContent: "Long output scrolls inside its own panel.",
};

export const sceneWorkers: Record<Scene, WorkerView[]> = {
  idle: samples.idle,
  running: samples.running,
  blocked: samples.blocked,
  longContent: samples.longContent,
};

// Own-property check: `in` would accept "toString".
export function oneOf<T extends string>(list: readonly T[], value: string | null): T | undefined {
  return list.find((item) => item === value);
}

/** Query for the bare Task screen in one scene and theme. */
export function frameSrc(scene: Scene, theme: Theme): string {
  return `?screen=task&sample=${scene}&theme=${theme}`;
}

/** Reads ?sample= and ?theme= for the bare Task screen. */
export function parseFrame(search: string): { scene: Scene; theme: Theme } {
  const query = new URLSearchParams(search);
  return {
    scene: oneOf(scenes, query.get("sample")) ?? "running",
    theme: oneOf(themes, query.get("theme")) ?? "dark",
  };
}
