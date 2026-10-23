export type RunnerKind = "codex" | "claude-code" | "ollama";
export type Pattern = "single" | "pair" | "propose-confirm";

export type Binding = {
  name: string;
  runner: RunnerKind;
  provider: string;
  model?: string;
  context?: number;
  endpoint: string;
  trainsOnData: boolean;
};

export type Limits = { maxRounds: number; maxSteps: number; maxFindings: number; maxFindingChars: number };

export type Crew = {
  pattern: Pattern;
  limits: Limits;
  roles: { writer: Binding; reviewer?: Binding; preReviewer?: Binding; fallback: Binding[] };
};

export type CrewResult = { ok: true; crew: Crew } | { ok: false; errors: string[] };

const AGENTS: RunnerKind[] = ["codex", "claude-code"];
const RUNNERS: RunnerKind[] = [...AGENTS, "ollama"];
const DEFAULT_LIMITS: Limits = { maxRounds: 3, maxSteps: 8, maxFindings: 10, maxFindingChars: 500 };
const LIMIT_KEYS: [keyof Limits, string][] = [
  ["maxRounds", "max_rounds"],
  ["maxSteps", "max_steps"],
  ["maxFindings", "max_findings"],
  ["maxFindingChars", "max_finding_chars"],
];

const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/;

function endpointProblem(endpoint: string, allowRemote: boolean): string | undefined {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return "must be an http or https URL";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "must be an http or https URL";
  if (!allowRemote && !LOOPBACK.test(url.hostname))
    return "is not on this machine; set policy.allow_remote_endpoints = true to use it";
}

// Two local models are distinct providers: diversity is per model, not per vendor.
const providerOf = (runner: RunnerKind, model?: string) =>
  runner === "codex" ? "openai" : runner === "claude-code" ? "anthropic" : `ollama:${model}`;

type Raw = Record<string, any>;

export function loadCrew(toml: string): CrewResult {
  let raw: Raw;
  try {
    raw = Bun.TOML.parse(toml) as Raw;
  } catch (e) {
    return { ok: false, errors: [`invalid TOML: ${(e as Error).message}`] };
  }
  const errors: string[] = [];
  const allowTraining = raw.policy?.allow_training_data === true;
  const allowRemote = raw.policy?.allow_remote_endpoints === true;

  const limits = { ...DEFAULT_LIMITS };
  for (const [key, tomlKey] of LIMIT_KEYS) {
    const v = raw.limits?.[tomlKey];
    if (v === undefined) continue;
    if (Number.isInteger(v) && v > 0) limits[key] = v;
    else errors.push(`limits.${tomlKey} must be a positive integer`);
  }

  const bindings = new Map<string, Binding>();
  const invalid = new Set<string>();
  for (const [name, b] of Object.entries<Raw>(raw.bindings ?? {})) {
    if (!RUNNERS.includes(b.runner)) {
      errors.push(`binding "${name}": unknown runner "${b.runner}"`);
      invalid.add(name);
      continue;
    }
    if (b.runner === "ollama" && !b.model) errors.push(`binding "${name}": ollama needs a model`);
    const endpoint = String(b.endpoint ?? "http://127.0.0.1:11434");
    const problem = endpointProblem(endpoint, allowRemote);
    if (problem) errors.push(`binding "${name}": endpoint "${endpoint}" ${problem}`);
    bindings.set(name, {
      name,
      runner: b.runner,
      provider: providerOf(b.runner, b.model),
      model: b.model,
      context: b.context,
      endpoint,
      trainsOnData: b.trains_on_data === true,
    });
  }

  const roles = raw.roles ?? {};
  const pick = (role: string, name: unknown): Binding | undefined => {
    if (name === undefined) return undefined;
    const b = bindings.get(String(name));
    if (!b && !invalid.has(String(name))) errors.push(`${role}: no binding named "${name}"`);
    return b;
  };
  const isAgent = (b: Binding) => AGENTS.includes(b.runner);

  const writer = pick("writer", roles.writer);
  const reviewer = pick("reviewer", roles.reviewer);
  const preReviewer = pick("pre_reviewer", roles.pre_reviewer);
  const fallback = ((roles.fallback ?? []) as unknown[]).map((n) => pick("fallback", n)).filter(Boolean) as Binding[];

  if (roles.writer === undefined) errors.push("roles.writer is required");
  if (writer && !isAgent(writer)) errors.push(`writer "${writer.name}" must be an agent CLI (codex or claude-code)`);
  for (const f of fallback) if (!isAgent(f)) errors.push(`fallback "${f.name}" must be an agent CLI (codex or claude-code)`);
  if (writer && reviewer && writer.provider === reviewer.provider)
    errors.push(`reviewer "${reviewer.name}" shares provider "${writer.provider}" with the writer`);
  // A fallback becomes the writer, so the pair rule holds for it too.
  for (const f of fallback)
    if (reviewer && f.provider === reviewer.provider)
      errors.push(`fallback "${f.name}" shares provider "${f.provider}" with reviewer "${reviewer.name}"`);
  if (roles.pre_reviewer !== undefined && roles.reviewer === undefined)
    errors.push("pre_reviewer needs a reviewer to confirm its findings");
  for (const b of [writer, reviewer, preReviewer, ...fallback])
    if (b?.trainsOnData && !allowTraining)
      errors.push(`binding "${b.name}" may train on your code; set policy.allow_training_data = true to use it`);

  if (errors.length || !writer) return { ok: false, errors: [...new Set(errors)] };
  const pattern: Pattern = preReviewer ? "propose-confirm" : reviewer ? "pair" : "single";
  return { ok: true, crew: { pattern, limits, roles: { writer, reviewer, preReviewer, fallback } } };
}
