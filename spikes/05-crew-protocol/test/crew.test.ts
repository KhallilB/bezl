import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadCrew } from "../src/crew";

const example = readFileSync(new URL("../crew.example.toml", import.meta.url), "utf8");

const errorsOf = (toml: string) => {
  const r = loadCrew(toml);
  return r.ok ? [] : r.errors;
};

describe("loadCrew", () => {
  test("accepts the example crew and derives propose-confirm", () => {
    const r = loadCrew(example);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.crew.pattern).toBe("propose-confirm");
    expect(r.crew.roles.writer.name).toBe("claude");
    expect(r.crew.roles.reviewer?.provider).toBe("openai");
    expect(r.crew.limits.maxRounds).toBe(3);
  });

  test("baseline crew is a single agent with default limits", () => {
    const r = loadCrew('[bindings.codex]\nrunner = "codex"\n[roles]\nwriter = "codex"\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.crew.pattern).toBe("single");
    expect(r.crew.limits).toEqual({ maxRounds: 3, maxSteps: 8, maxFindings: 10, maxFindingChars: 500 });
  });

  test("rejects an unknown runner", () => {
    expect(errorsOf('[bindings.x]\nrunner = "gemini"\n[roles]\nwriter = "x"\n')).toEqual([
      'binding "x": unknown runner "gemini"',
    ]);
  });

  test("writer must be an agent CLI with tools", () => {
    expect(
      errorsOf('[bindings.l]\nrunner = "ollama"\nmodel = "m"\n[roles]\nwriter = "l"\n'),
    ).toContain('writer "l" must be an agent CLI (codex or claude-code)');
  });

  test("reviewer must come from a different provider than the writer", () => {
    expect(
      errorsOf('[bindings.a]\nrunner = "codex"\n[bindings.b]\nrunner = "codex"\n[roles]\nwriter = "a"\nreviewer = "b"\n'),
    ).toContain('reviewer "b" shares provider "openai" with the writer');
  });

  test("pre-reviewer needs a reviewer to confirm its findings", () => {
    expect(
      errorsOf('[bindings.a]\nrunner = "codex"\n[bindings.l]\nrunner = "ollama"\nmodel = "m"\n[roles]\nwriter = "a"\npre_reviewer = "l"\n'),
    ).toContain("pre_reviewer needs a reviewer to confirm its findings");
  });

  test("ollama binding needs a model", () => {
    expect(errorsOf('[bindings.a]\nrunner = "codex"\n[bindings.l]\nrunner = "ollama"\n[roles]\nwriter = "a"\nreviewer = "l"\n')).toContain(
      'binding "l": ollama needs a model',
    );
  });

  test("blocks models that train on data unless policy allows it", () => {
    const toml =
      '[bindings.a]\nrunner = "codex"\n[bindings.f]\nrunner = "ollama"\nmodel = "m"\ntrains_on_data = true\n[roles]\nwriter = "a"\nreviewer = "f"\n';
    expect(errorsOf(toml)).toContain('binding "f" may train on your code; set policy.allow_training_data = true to use it');
    expect(errorsOf(`[policy]\nallow_training_data = true\n${toml}`)).toEqual([]);
  });

  test("roles must name existing bindings", () => {
    expect(errorsOf('[bindings.a]\nrunner = "codex"\n[roles]\nwriter = "a"\nreviewer = "missing"\n')).toContain(
      'reviewer: no binding named "missing"',
    );
  });

  test("fallback entries must be agent CLIs", () => {
    expect(
      errorsOf('[bindings.a]\nrunner = "codex"\n[bindings.l]\nrunner = "ollama"\nmodel = "m"\n[roles]\nwriter = "a"\nfallback = ["l"]\n'),
    ).toContain('fallback "l" must be an agent CLI (codex or claude-code)');
  });

  test("limits must be positive integers", () => {
    expect(errorsOf('[limits]\nmax_rounds = 0\n[bindings.a]\nrunner = "codex"\n[roles]\nwriter = "a"\n')).toContain(
      "limits.max_rounds must be a positive integer",
    );
  });

  test("reports invalid TOML instead of throwing", () => {
    expect(errorsOf("[roles\nwriter=")[0]).toStartWith("invalid TOML:");
  });
});
