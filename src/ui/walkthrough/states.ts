import * as samples from "../task/fixtures";
import type { WorkerView } from "../task/model";

export const scenes = ["idle", "running", "blocked", "longContent"] as const;
export type Scene = (typeof scenes)[number];

export const themes = ["dark", "light"] as const;
export type Theme = (typeof themes)[number];

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

/** Reads ?sample= and ?theme= for the bare Task screen. */
export function parseFrame(search: string): { scene: Scene; theme: Theme } {
  const query = new URLSearchParams(search);
  return {
    scene: oneOf(scenes, query.get("sample")) ?? "running",
    theme: oneOf(themes, query.get("theme")) ?? "dark",
  };
}
