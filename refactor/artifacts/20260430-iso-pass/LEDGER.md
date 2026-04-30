# Simplification Ledger

## Baseline

- Tests: `npm test` passed, 16 files / 161 tests.
- Typecheck: `npm run check` passed, 0 errors / 0 warnings.
- LOC: `src` + `tests` = 11488 lines.
- Duplication: `jscpd --min-lines 5 --min-tokens 50 src tests` found 47 clones, 492 duplicated lines / 6.36%.

## Candidate

| Candidate | LOC | Confidence | Risk | Score | Decision |
| --- | --- | --- | --- | --- | --- |
| Collapse duplicate MIME extension lookup in `src/cli/io.ts` | 2 | 5 | 1 | 10.0 | Accepted |
| Extract shared reference-add helper in `src/cli/project-store.ts` | 2 | 4 | 2 | 4.0 | Rejected: only two callsites, would add an abstraction |

## Change: Reuse IO MIME helpers inside IO

### Equivalence contract

- Inputs covered: file path data URLs, generated image persistence, project reference tests, bridge routing tests.
- Ordering preserved: N/A; no iteration order changed.
- Tie-breaking: unchanged; MIME extension fallback remains `png`.
- Error semantics: unsupported reference extensions still throw `INVALID_ARGS` with the same message and hint.
- Laziness: unchanged.
- Short-circuit eval: unchanged; file read still happens before MIME validation in `readFileAsDataUrl`.
- Floating-point: N/A.
- RNG / hash order: N/A.
- Observable side-effects: same file reads/writes and paths.
- Type narrowing: unchanged public TypeScript signatures.
- Rerender behavior: N/A.

### Verification

- `npm test`: passed, 16 files / 161 tests.
- `npm run check`: passed, 0 errors / 0 warnings.
- `npm run build:cli`: passed.
- LOC: `src` + `tests` = 11478 lines, delta -10.
- Duplication: 46 clones, 485 duplicated lines / 6.28%, delta -1 clone / -7 duplicated lines.
