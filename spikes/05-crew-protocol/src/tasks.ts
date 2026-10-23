import type { Task } from "./protocol";

export type TasksResult = { ok: true; tasks: Task[] } | { ok: false; errors: string[] };
const REQUIRED = ["id", "repo", "base", "goal", "allowed_paths", "checks"] as const;

export function loadTasks(toml: string): TasksResult {
  let raw: any;
  try {
    raw = Bun.TOML.parse(toml);
  } catch (e) {
    return { ok: false, errors: [`invalid TOML: ${(e as Error).message}`] };
  }
  const errors: string[] = [];
  const seen = new Set<string>();
  const tasks: Task[] = [];
  for (const t of raw.tasks ?? []) {
    const name = t.id ?? "?";
    const missing = REQUIRED.filter((k) => t[k] === undefined);
    for (const k of missing) errors.push(`task "${name}": missing ${k}`);
    if (seen.has(name)) errors.push(`duplicate task id "${name}"`);
    seen.add(name);
    if (!missing.length)
      tasks.push({ id: t.id, repo: t.repo, base: t.base, goal: t.goal, allowedPaths: t.allowed_paths, checks: t.checks });
  }
  if (!tasks.length && !errors.length) errors.push("no tasks");
  return errors.length ? { ok: false, errors } : { ok: true, tasks };
}
