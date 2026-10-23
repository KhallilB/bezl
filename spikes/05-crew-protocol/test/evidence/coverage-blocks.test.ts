import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCoverageBlocks } from "../../src/evidence/coverage-blocks";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

test("a go coverprofile yields exactly one block per profile line", async () => {
  const content = await readFile(
    path.join(fixtures, "go-coverprofile.out"),
    "utf8",
  );
  const blockLines = content
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("mode:")).length;

  const result = parseCoverageBlocks(content, "go");

  expect(result).toEqual({
    blocks: [
      {
        endLine: 12,
        file: "server/internal/example/example.go",
        hits: 1,
        producer: "go",
        startLine: 10,
      },
      {
        endLine: 16,
        file: "server/internal/example/example.go",
        hits: 0,
        producer: "go",
        startLine: 14,
      },
      {
        endLine: 22,
        file: "server/internal/example/example.go",
        hits: 1,
        producer: "go",
        startLine: 20,
      },
    ],
    producer: "go",
    status: "blocks",
  });
  expect(blockLines).toBe(3);
});

test("two go blocks covering identical lines survive as two", () => {
  const result = parseCoverageBlocks(
    ["mode: atomic", "a.go:5.2,5.30 1 0", "a.go:5.31,5.44 1 7", ""].join("\n"),
    "go",
  );

  expect(result).toMatchObject({
    blocks: [
      { endLine: 5, file: "a.go", hits: 0, startLine: 5 },
      { endLine: 5, file: "a.go", hits: 7, startLine: 5 },
    ],
    status: "blocks",
  });
});

test("a malformed go profile line raises and names the line", () => {
  expect(() =>
    parseCoverageBlocks(
      ["mode: atomic", "a.go:10.1,12.2 2 1", "a.go:oops 2 1"].join("\n"),
      "go",
    ),
  ).toThrow("a.go:oops 2 1");
});

test("a go profile without a mode header raises", () => {
  expect(() => parseCoverageBlocks("a.go:10.1,12.2 2 1\n", "go")).toThrow(
    /mode header/,
  );
});

test("an lcov record yields one block per DA line, never a widened range", async () => {
  const content = await readFile(path.join(fixtures, "vitest.lcov"), "utf8");

  const result = parseCoverageBlocks(content, "lcov");

  expect(result).toEqual({
    blocks: [
      {
        endLine: 10,
        file: "packages/ui/src/components/Button/Button.tsx",
        hits: 1,
        producer: "lcov",
        startLine: 10,
      },
      {
        endLine: 11,
        file: "packages/ui/src/components/Button/Button.tsx",
        hits: 1,
        producer: "lcov",
        startLine: 11,
      },
      {
        endLine: 12,
        file: "packages/ui/src/components/Button/Button.tsx",
        hits: 0,
        producer: "lcov",
        startLine: 12,
      },
    ],
    producer: "lcov",
    status: "blocks",
  });
});

test("repeated DA records for one line sum their runs into a single block", () => {
  // Both counts are non-zero on purpose: with a zero first run, summing and
  // taking the max agree, and max is the collapse TASK-067 exists to undo.
  const result = parseCoverageBlocks(
    ["SF:src/a.ts", "DA:4,2", "DA:4,3", "end_of_record", ""].join("\n"),
    "lcov",
  );

  expect(result).toMatchObject({
    blocks: [{ endLine: 4, file: "src/a.ts", hits: 5, startLine: 4 }],
    status: "blocks",
  });
});

test("a malformed lcov DA line raises and names the line", () => {
  expect(() =>
    parseCoverageBlocks(
      ["SF:src/a.ts", "DA:4,1", "DA:oops", "end_of_record"].join("\n"),
      "lcov",
    ),
  ).toThrow("DA:oops");
});

test("an lcov artefact with no SF record raises rather than reporting zero blocks", () => {
  expect(() => parseCoverageBlocks("", "lcov")).toThrow(/SF record/);
});

test("a DA line outside any SF section raises rather than being dropped", () => {
  expect(() => parseCoverageBlocks(["DA:4,1", ""].join("\n"), "lcov")).toThrow(
    "DA:4,1",
  );
});

test("go-func is declared block-incapable rather than answering zero blocks", async () => {
  const content = await readFile(path.join(fixtures, "go-func.txt"), "utf8");

  const result = parseCoverageBlocks(content, "go-func");

  expect(result).toMatchObject({
    producer: "go-func",
    status: "block-incapable",
  });
  expect(result).not.toHaveProperty("blocks");
  if (result.status === "block-incapable") {
    expect(result.reason).toMatch(/line range/i);
  }
});

test("istanbul json-summary is declared block-incapable", async () => {
  const content = await readFile(
    path.join(fixtures, "istanbul-summary.json"),
    "utf8",
  );

  const result = parseCoverageBlocks(content, "json-summary");

  expect(result).toMatchObject({
    producer: "json-summary",
    status: "block-incapable",
  });
  expect(result).not.toHaveProperty("blocks");
});
