/**
 * One measurement as its producer reported it. Conservation is enforced in this
 * unit because it is the only one nobody widened.
 */
export interface CoverageBlock {
  file: string;
  startLine: number;
  endLine: number;
  hits: number;
  /**
   * The rung that measured this block. Open set — core never enumerates it, and
   * it rides on the block so a merge of two sources stays attributable.
   */
  producer: string;
}

export type CoverageBlocksResult =
  | {
      status: "blocks";
      producer: string;
      blocks: CoverageBlock[];
    }
  | {
      status: "block-incapable";
      producer: string;
      reason: string;
    };

export type SourceFormat = "lcov" | "go" | "go-func" | "json-summary";

// From loupe covprofile/lib.ts, the only two helpers the block parsers use.
function normalizeFilePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").trim();
}

function parseGoCoverageLine(line: string): {
  file: string;
  startLine: number;
  endLine: number;
  numStatements: number;
  count: number;
} {
  const match = line.match(/^(.+):(\d+)\.(\d+),(\d+)\.(\d+)\s+(\d+)\s+(\d+)$/);
  if (!match) {
    throw new Error(`invalid go coverage line: ${line}`);
  }

  return {
    file: normalizeFilePath(match[1] ?? ""),
    startLine: Number(match[2]),
    endLine: Number(match[4]),
    numStatements: Number(match[6]),
    count: Number(match[7]),
  };
}

function parseGoBlocks(content: string, producer: string): CoverageBlock[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0 || !lines[0]?.startsWith("mode:")) {
    throw new Error("go coverage profile is missing mode header");
  }

  return lines.slice(1).map((line) => {
    const block = parseGoCoverageLine(line);
    return {
      endLine: block.endLine,
      file: block.file,
      hits: block.count,
      producer,
      startLine: block.startLine,
    };
  });
}

// The metrics parser in `lib.ts` is deliberately lenient about DA syntax: it
// feeds a gate that must not die on one odd row. Blocks are a denominator, so
// this one refuses instead — a silently skipped DA line is a block that reads
// as covered.
const DA_LINE = /^DA:(\d+),(\d+)(?:,.*)?$/;

function parseLcovBlocks(content: string, producer: string): CoverageBlock[] {
  const hitsByLineByFile = new Map<string, Map<number, number>>();
  let section: Map<number, number> | undefined;
  let sawRecord = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.startsWith("SF:")) {
      sawRecord = true;
      const file = normalizeFilePath(line.slice(3));
      section = hitsByLineByFile.get(file);
      if (!section) {
        section = new Map();
        hitsByLineByFile.set(file, section);
      }
      continue;
    }
    if (line === "end_of_record") {
      section = undefined;
      continue;
    }
    if (!line.startsWith("DA:")) {
      continue;
    }

    const match = line.match(DA_LINE);
    if (!match) {
      throw new Error(`invalid lcov DA line: ${line}`);
    }
    if (!section) {
      throw new Error(`lcov DA line outside any SF section: ${line}`);
    }

    // lcov's own LF/LH count a line once, and merged output repeats a line to
    // add its runs. Two blocks for one line would let the same line be counted
    // covered and uncovered at once.
    const lineNumber = Number(match[1]);
    section.set(lineNumber, (section.get(lineNumber) ?? 0) + Number(match[2]));
  }

  // An artefact with no SF record at all is not an empty measurement, it is not
  // lcov. Zero blocks would read downstream as measured-and-found-nothing.
  if (!sawRecord) {
    throw new Error("lcov coverage artefact has no SF record");
  }

  const blocks: CoverageBlock[] = [];
  for (const [file, hitsByLine] of hitsByLineByFile) {
    for (const [lineNumber, hits] of hitsByLine) {
      blocks.push({
        endLine: lineNumber,
        file,
        hits,
        producer,
        startLine: lineNumber,
      });
    }
  }
  return blocks;
}

function incapable(
  producer: SourceFormat,
  reason: string,
): CoverageBlocksResult {
  return { producer, reason, status: "block-incapable" };
}

/**
 * Parse a coverage artefact into the blocks its producer reported, or declare
 * the format block-incapable. No sort: within a file, block order is producer
 * order; across files, lcov blocks group by first-seen file.
 */
export function parseCoverageBlocks(
  content: string,
  format: SourceFormat,
): CoverageBlocksResult {
  // Exhaustive on purpose: a new rung must state whether it can answer in
  // blocks, and a missing arm is a type error rather than a silent zero.
  switch (format) {
    case "go":
      return {
        blocks: parseGoBlocks(content, format),
        producer: format,
        status: "blocks",
      };
    case "lcov":
      return {
        blocks: parseLcovBlocks(content, format),
        producer: format,
        status: "blocks",
      };
    case "go-func":
      return incapable(
        format,
        "go-func reports a percentage per function, not line ranges",
      );
    case "json-summary":
      return incapable(
        format,
        "istanbul json-summary reports totals per file, not line ranges",
      );
  }
}
