export type ChangedLinesByFile = Record<string, Set<number>>;

const C_ESCAPES: Record<string, number> = {
  '"': 0x22,
  "\\": 0x5c,
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  v: 0x0b,
};

// Git C-quotes a header path containing a tab, backslash, quote or control
// byte. core.quotePath=false only suppresses the high-byte case, so a quoted
// header still arrives here and its escapes name bytes, not characters.
function decodeQuotedPath(value: string): string | undefined {
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) {
    return undefined;
  }
  // By code point, not code unit: quotePath=false leaves a non-BMP character
  // literal, and a lone surrogate encodes as U+FFFD. Escapes are all ASCII.
  const body = Array.from(value.slice(1, -1));
  const encoder = new TextEncoder();
  const bytes: number[] = [];

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index] ?? "";
    if (char !== "\\") {
      bytes.push(...encoder.encode(char));
      continue;
    }
    const escape = body[index + 1] ?? "";
    const literal = C_ESCAPES[escape];
    if (literal !== undefined) {
      bytes.push(literal);
      index += 1;
      continue;
    }
    if (escape >= "0" && escape <= "7") {
      bytes.push(Number.parseInt(body.slice(index + 1, index + 4).join(""), 8));
      index += 3;
      continue;
    }
    bytes.push(...encoder.encode(escape));
    index += 1;
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// Git delimits the path with a tab when it needs one — a name ending in a
// space is left unquoted and separated that way, so trimming the value would
// eat both the separator and the filename's own last character.
function headerPath(value: string): string {
  const tab = value.indexOf("\t");
  const raw = (tab === -1 ? value : value.slice(0, tab)).replace(/\r$/, "");
  return (decodeQuotedPath(raw) ?? raw).replace(/^\.\//, "");
}

interface BodyOwed {
  old: number;
  new: number;
}

// A hunk owes each side its declared count, and a context line is owed by both.
// Summing the two counts context twice, and the surplus eats what follows.
function claimBodyLine(rawLine: string, owed: BodyOwed): boolean {
  if (rawLine.startsWith(" ") && owed.old > 0 && owed.new > 0) {
    owed.old -= 1;
    owed.new -= 1;
    return true;
  }
  if (rawLine.startsWith("-") && owed.old > 0) {
    owed.old -= 1;
    return true;
  }
  if (rawLine.startsWith("+") && owed.new > 0) {
    owed.new -= 1;
    return true;
  }
  return false;
}

// `--- `/`+++ ` are body-shaped, so a still-owing hunk settles against them. No
// body line can start `@@`, so the header it must precede is what tells them apart.
function opensFile(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  if (line.startsWith("--- ") && (lines[index + 1] ?? "").startsWith("+++ ")) {
    return (lines[index + 2] ?? "").startsWith("@@");
  }
  return line.startsWith("+++ ") && (lines[index + 1] ?? "").startsWith("@@");
}

/**
 * Changed lines keyed by the path the patch header renders. The lossy channel:
 * that path is delimited, quoted and prefixed by rules repo config rewrites, so
 * it is for callers holding patch text and nothing else. Anything that can run
 * git reads identity from `git diff --raw -z --patch` via `parseRawZPatch`.
 */
export function parseChangedLinesFromUnifiedDiff(
  diffText: string,
): ChangedLinesByFile {
  // Null-prototype: `constructor` and `toString` are legal paths that would
  // otherwise read back a prototype member, and `__proto__` would reparent.
  const changed: ChangedLinesByFile = Object.create(null);
  let currentFile = "";
  // Lines still owed to the open hunk. An added source line reading `++ x`
  // renders as `+++ x`, so only outside a body is `+++` a header.
  const owed: BodyOwed = { new: 0, old: 0 };

  const lines = diffText.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    if (owed.old > 0 || owed.new > 0) {
      // "\ No newline at end of file" annotates the previous line; it is not one.
      if (rawLine.startsWith("\\")) {
        continue;
      }
      if (!opensFile(lines, index) && claimBodyLine(rawLine, owed)) {
        continue;
      }
      // Not body-shaped, or the next file: the hunk was truncated.
      owed.old = 0;
      owed.new = 0;
    }

    if (rawLine.startsWith("+++ ")) {
      // Decode before stripping the prefix: the quote wraps `b/` too.
      const file = headerPath(rawLine.slice(4));
      if (file === "/dev/null") {
        currentFile = "";
      } else {
        currentFile = file.startsWith("b/") ? file.slice(2) : file;
      }
      if (currentFile) {
        changed[currentFile] = changed[currentFile] ?? new Set<number>();
      }
      continue;
    }

    if (!currentFile || !rawLine.startsWith("@@")) {
      continue;
    }

    const match = rawLine.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!match) {
      continue;
    }

    const start = Number(match[3]);
    const count = Number(match[4] ?? "1");
    // Claim the body up front, so its lines are never re-read as headers.
    owed.old = Number(match[2] ?? "1");
    owed.new = count;
    if (count <= 0) {
      continue;
    }

    const fileSet = changed[currentFile] ?? new Set<number>();
    changed[currentFile] = fileSet;
    for (let lineNo = start; lineNo < start + count; lineNo += 1) {
      fileSet.add(lineNo);
    }
  }

  return changed;
}

export interface DiffRecord {
  status: string;
  /** Destination path — for a rename or copy, the surviving side. */
  path: string;
}

export interface RawZPatch {
  records: DiffRecord[];
  patch: string;
}

/**
 * Split `git diff --raw -z --patch` into its two sections. One invocation, so
 * both describe the same snapshot; `-z` is the one form git documents as
 * unquoted, so a path arrives as verbatim bytes. An empty field ends the raw
 * section — everything after it is patch text.
 */
export function parseRawZPatch(stream: string): RawZPatch {
  const fields = stream.split("\0");
  const records: DiffRecord[] = [];

  let index = 0;
  while (index < fields.length) {
    const info = fields[index] ?? "";
    if (info === "") {
      index += 1;
      break;
    }
    // Consume by count, never by shape: a file named like an info field is a path.
    const status = info.slice(info.lastIndexOf(" ") + 1);
    const pathCount = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
    const paths = fields.slice(index + 1, index + 1 + pathCount);
    if (paths.length < pathCount || paths.includes("")) break;
    records.push({ path: paths[pathCount - 1] ?? "", status });
    index += 1 + pathCount;
  }

  return { patch: fields.slice(index).join("\0"), records };
}

/**
 * New-side changed lines per file chunk, in diff order, from a zero-context
 * diff. Chunk position is the identity: an empty set still occupies its slot.
 *
 * Requires git's own patch: chunks are counted off `diff --git`, so a section
 * from `diff.external` or plain `diff -u` yields none rather than failing.
 */
export function parseHunkRangesByChunk(diffText: string): Set<number>[] {
  const chunks: Set<number>[] = [];
  let current: Set<number> | undefined;
  // Lines still owed to the open hunk. `diff --git ` and `@@` cannot be body
  // lines here — a body line carries a prefix — so this claim is redundant cover.
  const owed: BodyOwed = { new: 0, old: 0 };

  for (const rawLine of diffText.split(/\r?\n/)) {
    if (owed.old > 0 || owed.new > 0) {
      // "\ No newline at end of file" annotates the previous line; it is not one.
      if (rawLine.startsWith("\\")) {
        continue;
      }
      if (claimBodyLine(rawLine, owed)) {
        continue;
      }
      owed.old = 0;
      owed.new = 0;
    }

    if (rawLine.startsWith("diff --git ")) {
      current = new Set<number>();
      chunks.push(current);
      continue;
    }

    if (!current || !rawLine.startsWith("@@")) {
      continue;
    }

    const match = rawLine.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!match) {
      continue;
    }

    const start = Number(match[3]);
    const count = Number(match[4] ?? "1");
    owed.old = Number(match[2] ?? "1");
    owed.new = count;
    for (let lineNo = start; lineNo < start + count; lineNo += 1) {
      current.add(lineNo);
    }
  }

  return chunks;
}
