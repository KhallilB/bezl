export type Role = "writer" | "reviewer" | "pre_reviewer";
export type Usage = { input: number; output: number; cached: number };
export type RunRequest = { role: Role; prompt: string; cwd: string; writable: boolean; schema: object };
export type Parsed = { ok: true; json: unknown; usage: Usage } | { ok: false; error: string; usage: Usage };
export type RunResponse = Parsed & { wallMs: number };
export interface Runner {
  run(req: RunRequest): Promise<RunResponse>;
}
