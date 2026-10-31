// View models for the task journey; M5 fills them from the task's event log.

export const stageIds = ["brief", "plan", "build", "check", "review", "ship"] as const;
export type StageId = (typeof stageIds)[number];

export const stageLabel: Record<StageId, string> = {
  brief: "Brief",
  plan: "Plan",
  build: "Build",
  check: "Check",
  review: "Review",
  ship: "Ship",
};

/** One hue per meaning: teal working, amber needs you, red failed, green done. */
export type Light = "done" | "working" | "needsYou" | "failed" | "waiting";
export type StageLights = Record<StageId, Light>;
export type TaskLight = "working" | "needsYou" | "failed" | "passed" | "idle";

export const lightLabel: Record<Light | TaskLight, string> = {
  done: "done",
  passed: "passed",
  working: "working",
  needsYou: "needs you",
  failed: "failed",
  waiting: "waiting",
  idle: "idle",
};

/** What needs you comes first, then failures, then live work. */
export function taskLight(stages: StageLights): TaskLight {
  const lights = stageIds.map((id) => stages[id]);
  if (lights.includes("needsYou")) return "needsYou";
  if (lights.includes("failed")) return "failed";
  if (lights.includes("working")) return "working";
  return lights.every((l) => l === "done") ? "passed" : "idle";
}

/** A waiting stage shows its number; any other light shows its word. */
export function stageMarker(light: Light, index: number): string {
  return light === "waiting" ? String(index + 1) : lightLabel[light];
}

export type Row = {
  text: string;
  /** Short trailing fact, such as who checks it or a count. */
  meta?: string;
  light?: Light;
  /** Code, paths and commands keep a mono face. */
  mono?: boolean;
};

export type Section = { title: string; rows: Row[] };

export type StageView = {
  /** The status sentence: a bold lead, then the rest. */
  lead: string;
  rest?: string;
  /** The operator's own words, shown as a quote. */
  quote?: string;
  sections: Section[];
};

export type JourneyTask = {
  id: string;
  title: string;
  repo: string;
  stages: StageLights;
  /** Where the task stands now; opens first. */
  current: StageId;
  views: Record<StageId, StageView>;
};

export type ProviderUsage = { name: string; used: string };
