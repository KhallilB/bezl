# Provenance

Ported from loupe (`KhallilB/loupe`, private) at `33e45b0`, same author, for E1 (`bezl verify`). Loupe is frozen; these files are now maintained here.

| Here | Loupe source |
|---|---|
| `changed-lines.ts` | `src/core/changed-lines.ts`, verbatim except one doc comment |
| `coverage-blocks.ts` | `src/core/coverage-blocks.ts`, `src/adapters/covprofile/blocks.ts`, and `normalizeFilePath` and `parseGoCoverageLine` from `src/adapters/covprofile/lib.ts` |
| `../../test/evidence/` | `test/core/changed-lines.test.ts`, `test/covprofile/blocks.test.ts` and their fixtures, with import paths changed |

Not ported yet: loupe's git adapter (`src/adapters/git/changed-lines.ts`), which runs git with repository config neutralised, and its infigraph boundary adapter. The join of changed lines, symbol boundaries and coverage blocks was never built in loupe; it is week 2 of the plan.
