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
| Extract browser reference payload mapper in `src/cli/web-server.ts` | 3 | 5 | 1 | 15.0 | Accepted |
| Re-export shared project status/domain types from `src/lib/types.ts` | 3 | 5 | 2 | 7.5 | Accepted |
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

## Change: Extract browser reference payload mapper

### Equivalence contract

- Inputs covered: project reference list, uploaded refs response, reference role update response.
- Ordering preserved: yes; `browserRefs` still maps `listReferences(projectId)` in source order.
- Tie-breaking: N/A.
- Error semantics: unchanged; `readFileAsDataUrl(ref.path)` still runs for each returned ref and throws the same errors.
- Laziness: unchanged; refs are still eagerly converted before API response return.
- Short-circuit eval: unchanged.
- Floating-point: N/A.
- RNG / hash order: N/A.
- Observable side-effects: same file reads, same response keys and values.
- Type narrowing: unchanged; helper uses the existing `listReferences` return element shape.
- Rerender behavior: N/A.

### Verification

- `npm test`: passed, 16 files / 161 tests.
- `npm run check`: passed, 0 errors / 0 warnings.
- `npm run build:cli`: passed.
- LOC after this change: `src` + `tests` = 11462 lines, cumulative delta -26.
- Duplication after this change: 44 clones, 465 duplicated lines / 6.03%, cumulative delta -3 clones / -27 duplicated lines.

## Change: Re-export shared project status/domain types

### Equivalence contract

- Inputs covered: TypeScript compile for CLI, web bridge, and Svelte client imports.
- Ordering preserved: N/A; type-only change.
- Tie-breaking: N/A.
- Error semantics: unchanged; no runtime code changed.
- Laziness: N/A.
- Short-circuit eval: N/A.
- Floating-point: N/A.
- RNG / hash order: N/A.
- Observable side-effects: none; emitted JavaScript should not gain runtime imports for type-only symbols.
- Type narrowing: equivalent aliases now come from the shared `src/lib/types.ts` source.
- Rerender behavior: N/A.

### Verification

- `npm test`: passed, 16 files / 161 tests.
- `npm run check`: passed, 0 errors / 0 warnings.
- `npm run build:cli`: passed.
- LOC after this change: `src` + `tests` = 11446 lines, cumulative delta -42.
- Duplication after this change: 43 clones, 441 duplicated lines / 5.73%, cumulative delta -4 clones / -51 duplicated lines.

## Final Dashboard

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| LOC (`src` + `tests`) | 11488 | 11446 | -42 |
| jscpd clones | 47 | 43 | -4 |
| duplicated lines | 492 | 441 | -51 |
| duplication index | 6.36% | 5.73% | -0.63 pp |
| tests | 161 passed | 161 passed | 0 |
| typecheck warnings | 0 | 0 | 0 |
| CLI build | passed | passed | unchanged |

## Remaining Production Candidates

- `src/cli/project-store.ts` still has two similar reference-add paths. Rejected for this pass because the variants have different source/error semantics and only two callsites.
- Remaining scanner output is mostly test fixture repetition. It can be tackled separately, but it is lower product risk/value than production source shrinkage.
