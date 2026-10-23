import { expect, test } from "bun:test";

import {
  parseChangedLinesFromUnifiedDiff,
  parseHunkRangesByChunk,
  parseRawZPatch,
} from "../../src/evidence/changed-lines";

test("parses added lines from a zero-context unified diff", () => {
  const changed = parseChangedLinesFromUnifiedDiff(`
diff --git a/src/example.ts b/src/example.ts
index 1111111..2222222 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -4,0 +5,2 @@
+first();
+second();
`);

  expect(changed).toEqual({ "src/example.ts": new Set([5, 6]) });
});

test("keeps parser behavior explicit when passed context it must not receive", () => {
  const changed = parseChangedLinesFromUnifiedDiff(`
--- a/src/example.ts
+++ b/src/example.ts
@@ -2,3 +2,4 @@
 unchanged();
 added();
 unchangedAgain();
`);

  expect(changed).toEqual({ "src/example.ts": new Set([2, 3, 4, 5]) });
});

test("decodes C-quoted path headers", () => {
  // core.quotePath=false only stops high-byte quoting; git still quotes a tab,
  // a backslash or a double quote, and the raw path is a file that never exists.
  const changed = parseChangedLinesFromUnifiedDiff(
    [
      '+++ "b/src/a\\tb.ts"',
      "@@ -2 +2 @@",
      "-old",
      "+new",
      '+++ "b/src/back\\\\slash.ts"',
      "@@ -3 +3 @@",
      "-old",
      "+new",
      '+++ "b/src/say\\"hi\\".ts"',
      "@@ -4 +4 @@",
      "-old",
      "+new",
    ].join("\n"),
  );

  expect(Object.keys(changed).sort()).toEqual([
    "src/a\tb.ts",
    "src/back\\slash.ts",
    'src/say"hi".ts',
  ]);
  expect([...(changed["src/a\tb.ts"] ?? [])]).toEqual([2]);
  expect([...(changed["src/back\\slash.ts"] ?? [])]).toEqual([3]);
});

test("keeps a trailing space that the header's tab separator delimits", () => {
  // Git leaves such a path unquoted and appends a tab, so trimming the value
  // eats the separator and the filename's own last character.
  const changed = parseChangedLinesFromUnifiedDiff(
    ["+++ b/src/trail.ts \t", "@@ -2 +2 @@", "-old", "+new"].join("\n"),
  );

  expect(Object.keys(changed)).toEqual(["src/trail.ts "]);
});

test("does not create entries for deleted files or zero-count hunks", () => {
  const changed = parseChangedLinesFromUnifiedDiff(`
--- a/src/deleted.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-first();
-second();
--- a/src/remaining.ts
+++ b/src/remaining.ts
@@ -3,1 +3,0 @@
-removed();
`);

  expect(changed).toEqual({ "src/remaining.ts": new Set() });
});

// The two-channel contract. A patch header's path is config-dependent and
// ambiguous; hunk geometry is not. These cover the geometry channel and the
// NUL name channel that now carries identity.

test("returns one hunk-range set per file chunk, in diff order", () => {
  const ranges = parseHunkRangesByChunk(
    [
      "diff --git a/src/one.ts b/src/one.ts",
      "index 1111111..2222222 100644",
      "--- a/src/one.ts",
      "+++ b/src/one.ts",
      "@@ -4,0 +5,2 @@",
      "+first();",
      "+second();",
      "diff --git a/src/two.ts b/src/two.ts",
      "--- a/src/two.ts",
      "+++ b/src/two.ts",
      "@@ -9 +9 @@",
      "-old();",
      "+new();",
    ].join("\n"),
  );

  expect(ranges).toEqual([new Set([5, 6]), new Set([9])]);
});

test("never reads a hunk body line as a chunk boundary", () => {
  // A body line always carries its `+`/`-`/space, so it cannot equal a boundary
  // here. The claimed body is the belt to that braces, not the only guard.
  const ranges = parseHunkRangesByChunk(
    [
      "diff --git a/src/one.ts b/src/one.ts",
      "+++ b/src/one.ts",
      "@@ -1,0 +1,2 @@",
      "+diff --git a/forged.ts b/forged.ts",
      "+@@ -1 +1 @@",
    ].join("\n"),
  );

  expect(ranges).toEqual([new Set([1, 2])]);
});

test("keeps an empty chunk so chunk positions stay aligned with name records", () => {
  const ranges = parseHunkRangesByChunk(
    [
      "diff --git a/src/gone.ts b/src/gone.ts",
      "--- a/src/gone.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-first();",
      "-second();",
      "diff --git a/src/kept.ts b/src/kept.ts",
      "@@ -3,0 +4,1 @@",
      "+added();",
    ].join("\n"),
  );

  expect(ranges).toEqual([new Set(), new Set([4])]);
});

test("recovers the next chunk when a hunk declares more body than it has", () => {
  // A truncated patch would otherwise swallow the following boundary and shift
  // every later chunk one place, misnaming every file after it.
  const ranges = parseHunkRangesByChunk(
    [
      "diff --git a/src/one.ts b/src/one.ts",
      "@@ -1,0 +1,3 @@",
      "+only();",
      "diff --git a/src/two.ts b/src/two.ts",
      "@@ -5 +5 @@",
      "-old();",
      "+new();",
    ].join("\n"),
  );

  expect(ranges).toEqual([new Set([1, 2, 3]), new Set([5])]);
});

test("splits one --raw -z --patch invocation into records and patch text", () => {
  const { records, patch } = parseRawZPatch(
    [
      ":100644 100644 57d47e7 be8e143 M",
      "backlog/docs/traceability.md",
      ":000000 100644 0000000 b77d379 A",
      "src/core/changed-lines.ts",
      "",
    ].join("\0") + ["diff --git a/x b/x", "@@ -1 +1 @@", "-a", "+b"].join("\n"),
  );

  expect(records).toEqual([
    { path: "backlog/docs/traceability.md", status: "M" },
    { path: "src/core/changed-lines.ts", status: "A" },
  ]);
  expect(patch.startsWith("diff --git a/x b/x")).toBe(true);
});

test("takes a rename record's destination path", () => {
  const { records } = parseRawZPatch(
    [
      ":100644 100644 aaaaaaa bbbbbbb R100",
      "src/old.ts",
      "src/new.ts",
      ":100644 000000 ccccccc 0000000 D",
      "src/gone.ts",
      "",
      "",
    ].join("\0"),
  );

  expect(records).toEqual([
    { path: "src/new.ts", status: "R100" },
    { path: "src/gone.ts", status: "D" },
  ]);
});

test("consumes raw fields by count, so a path shaped like an info field is a path", () => {
  // `-z` never quotes, so a file named `:100644 100644 a b M` arrives verbatim.
  // Identifying a field by how it looks rather than where it sits would
  // desynchronize the stream and rename every file after it.
  const { records } = parseRawZPatch(
    [
      ":100644 100644 aaaaaaa bbbbbbb M",
      ":100644 100644 a b M",
      ":100644 100644 ccccccc ddddddd M",
      "src/real.ts",
      "",
      "",
    ].join("\0"),
  );

  expect(records).toEqual([
    { path: ":100644 100644 a b M", status: "M" },
    { path: "src/real.ts", status: "M" },
  ]);
});

test("yields no records and no patch for an empty diff", () => {
  expect(parseRawZPatch("")).toEqual({ patch: "", records: [] });
});

test("keeps file boundaries in a patch with no `diff --git` line", () => {
  // A hunk's body is context + adds + dels, but old_count + new_count counts
  // context twice. In git output the surplus dies on the next `diff --git`; a
  // plain `diff -u` patch has none, so it eats the following header pair.
  const changed = parseChangedLinesFromUnifiedDiff(
    [
      "--- a/src/first.ts",
      "+++ b/src/first.ts",
      "@@ -1,3 +1,3 @@",
      " one();",
      "-two();",
      "+TWO();",
      " three();",
      "--- a/src/second.ts",
      "+++ b/src/second.ts",
      "@@ -1,3 +1,3 @@",
      " one();",
      "-two();",
      "+TWO();",
      " three();",
    ].join("\n"),
  );

  expect(changed).toEqual({
    "src/first.ts": new Set([1, 2, 3]),
    "src/second.ts": new Set([1, 2, 3]),
  });
});

test("recovers the next file header when a hunk declares more body than it has", () => {
  // A truncated hunk leaves lines still owed. Without dropping that claim at
  // the first line the body cannot explain, the following `--- `/`+++ ` pair
  // settles it instead and the second file is never opened.
  const changed = parseChangedLinesFromUnifiedDiff(
    [
      "diff --git a/src/first.ts b/src/first.ts",
      "--- a/src/first.ts",
      "+++ b/src/first.ts",
      "@@ -1,3 +1,3 @@",
      " one();",
      "diff --git a/src/second.ts b/src/second.ts",
      "--- a/src/second.ts",
      "+++ b/src/second.ts",
      "@@ -1 +1 @@",
      "-two();",
      "+TWO();",
    ].join("\n"),
  );

  expect(changed).toEqual({
    "src/first.ts": new Set([1, 2, 3]),
    "src/second.ts": new Set([1]),
  });
});

test("settles a context line against both sides, so a bare `+++` still reads as a header", () => {
  // A context line is owed by the old and the new side at once. Settling it
  // against one leaves the other over-claimed, and the surplus is spent on the
  // next `+++` — which no `---` precedes here, so nothing else drops the claim.
  const changed = parseChangedLinesFromUnifiedDiff(
    [
      "+++ b/src/first.ts",
      "@@ -1,3 +1,3 @@",
      " one();",
      "-two();",
      "+TWO();",
      " three();",
      "+++ b/src/second.ts",
      "@@ -1 +1 @@",
      "-old();",
      "+new();",
    ].join("\n"),
  );

  expect(changed).toEqual({
    "src/first.ts": new Set([1, 2, 3]),
    "src/second.ts": new Set([1]),
  });
});

test("drops a truncated hunk's claim at the next header pair, not on `diff --git`", () => {
  // `--- `/`+++ ` are body-shaped, so a still-owing hunk settles against them
  // and swallows the file they open. Only a header pair the `@@` confirms.
  const changed = parseChangedLinesFromUnifiedDiff(
    [
      "--- a/src/first.ts",
      "+++ b/src/first.ts",
      "@@ -1,3 +1,3 @@",
      " one();",
      "--- a/src/second.ts",
      "+++ b/src/second.ts",
      "@@ -10 +10 @@",
      "-two();",
      "+TWO();",
    ].join("\n"),
  );

  expect(changed).toEqual({
    "src/first.ts": new Set([1, 2, 3]),
    "src/second.ts": new Set([10]),
  });
});

test("drops a truncated hunk's claim at a bare `+++` header too", () => {
  // A patch with no `--- ` side still opens files. The pair is not the signal;
  // the `@@` that must follow any header is.
  const changed = parseChangedLinesFromUnifiedDiff(
    [
      "+++ b/src/first.ts",
      "@@ -1,3 +1,3 @@",
      " one();",
      "+++ b/src/second.ts",
      "@@ -10 +10 @@",
      "-two();",
      "+TWO();",
    ].join("\n"),
  );

  expect(changed).toEqual({
    "src/first.ts": new Set([1, 2, 3]),
    "src/second.ts": new Set([10]),
  });
});

test("keeps a non-BMP character in a C-quoted header path", () => {
  // core.quotePath=false leaves the emoji literal while the tab still forces
  // quoting. Indexing by UTF-16 unit splits the pair into two U+FFFD.
  const changed = parseChangedLinesFromUnifiedDiff(
    [
      '+++ "b/src/emoji-\u{1F600}\\t.ts"',
      "@@ -1 +1 @@",
      "-old();",
      "+new();",
    ].join("\n"),
  );

  expect(changed).toEqual({ "src/emoji-\u{1F600}\t.ts": new Set([1]) });
});

test("decodes an octal-escaped non-BMP path, the quotePath=true rendering", () => {
  // The default escapes every high byte, so the same name arrives as UTF-8
  // octal. Both renderings must land on one key.
  const changed = parseChangedLinesFromUnifiedDiff(
    [
      '+++ "b/src/emoji-\\360\\237\\230\\200\\t.ts"',
      "@@ -1 +1 @@",
      "-old();",
      "+new();",
    ].join("\n"),
  );

  expect(changed).toEqual({ "src/emoji-\u{1F600}\t.ts": new Set([1]) });
});

test("never opens a file from a body line that renders as a header", () => {
  // An added source line `++ b/forged.ts` renders `+++ b/forged.ts`. The hunk
  // declares its length, so the body is claimed before anything reads headers.
  const changed = parseChangedLinesFromUnifiedDiff(
    [
      "+++ b/src/one.ts",
      "@@ -1,0 +1,3 @@",
      "+++ b/forged.ts",
      "+plain();",
      "+more();",
    ].join("\n"),
  );

  expect(changed).toEqual({ "src/one.ts": new Set([1, 2, 3]) });
});

test("never opens a file from a body pair no `@@` confirms", () => {
  // Deleting `-- a/forged.ts` and adding `++ b/forged.ts` renders a header pair
  // inside the body. Only the `@@` a real header precedes tells them apart.
  const changed = parseChangedLinesFromUnifiedDiff(
    [
      "--- a/src/one.ts",
      "+++ b/src/one.ts",
      "@@ -1,2 +1,2 @@",
      "--- a/forged.ts",
      "+++ b/forged.ts",
      "-second();",
      "+SECOND();",
    ].join("\n"),
  );

  expect(changed).toEqual({ "src/one.ts": new Set([1, 2]) });
});

// `constructor`, `toString` and `valueOf` are legal filenames whose lookup on a
// prototype-bearing object returns a function, so `?? new Set()` never fires.
test.each(["constructor", "toString", "valueOf", "__proto__"])(
  "keys a file named %s by its path, not by the prototype member it shadows",
  (name) => {
    const changed = parseChangedLinesFromUnifiedDiff(
      [
        `diff --git a/${name} b/${name}`,
        "index 1111111..2222222 100644",
        `--- a/${name}`,
        `+++ b/${name}`,
        "@@ -0,0 +1,2 @@",
        "+one();",
        "+two();",
        "",
      ].join("\n"),
    );

    expect(changed).toEqual({ [name]: new Set([1, 2]) });
  },
);
