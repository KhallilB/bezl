import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadCrew } from "../src/crew";

const example = readFileSync(new URL("../crew.example.toml", import.meta.url), "utf8");

const errorsOf = (toml: string) => {
  const r = loadCrew(toml);
  return r.ok ? [] : r.errors;
};
const degradationsOf = (toml: string) => {
  const r = loadCrew(toml);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.crew.degradations;
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
    expect(r.crew.degradations).toEqual([
      'fallback "codex" shares provider "openai" with reviewer "codex": if it takes over, the review is self-review',
    ]);
  });

  test("baseline crew is a single agent with default limits", () => {
    const r = loadCrew('[bindings.codex]\nrunner = "codex"\n[roles]\nwriter = "codex"\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.crew.pattern).toBe("single");
    expect(r.crew.limits).toEqual({ maxRounds: 3, maxSteps: 8, maxFindings: 10, maxFindingChars: 500 });
    expect(r.crew.degradations).toEqual([]);
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

  test("a reviewer from the writer's provider loads as self-review", () => {
    expect(
      degradationsOf('[bindings.a]\nrunner = "codex"\n[bindings.b]\nrunner = "codex"\n[roles]\nwriter = "a"\nreviewer = "b"\n'),
    ).toEqual(['reviewer "b" shares provider "openai" with writer "a": the review is self-review']);
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

  test("a fallback from the reviewer's provider loads, flagged", () => {
    expect(
      degradationsOf(
        '[bindings.claude]\nrunner = "claude-code"\n[bindings.codex]\nrunner = "codex"\n[roles]\nwriter = "claude"\nreviewer = "codex"\nfallback = ["codex"]\n',
      ),
    ).toEqual(['fallback "codex" shares provider "openai" with reviewer "codex": if it takes over, the review is self-review']);
  });

  describe("endpoints", () => {
    const local = (endpoint: string, policy = "") =>
      `${policy}[bindings.a]\nrunner = "codex"\n[bindings.l]\nrunner = "ollama"\nmodel = "m"\nendpoint = "${endpoint}"\n[roles]\nwriter = "a"\nreviewer = "l"\n`;
    const endpointErrors = (toml: string) => errorsOf(toml).filter((e) => e.includes("endpoint"));

    test.each(["http://127.0.0.1:11434", "http://localhost:11434", "http://[::1]:11434", "http://127.0.0.2:8080"])(
      "accepts loopback %s",
      (url) => expect(endpointErrors(local(url))).toEqual([]),
    );

    test("refuses an endpoint off this machine", () => {
      expect(endpointErrors(local("https://ollama.example.com"))).toEqual([
        'binding "l": endpoint "https://ollama.example.com" is not on this machine; set policy.allow_remote_endpoints = true to use it',
      ]);
    });

    test("allows a remote endpoint when the policy says so", () => {
      expect(endpointErrors(local("https://ollama.example.com", "[policy]\nallow_remote_endpoints = true\n"))).toEqual([]);
    });

    test("refuses an endpoint that is not an http URL", () => {
      expect(endpointErrors(local("127.0.0.1:11434"))).toEqual([
        'binding "l": endpoint "127.0.0.1:11434" must be an http or https URL',
      ]);
    });
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
