# Evals

An eval checks the running app the way a person uses it: real Postgres, real HTTP, the HTML the server sends. Unit tests check functions. Evals check that the README's requirements hold end to end.

| Eval                     | Measures                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| [exercise](exercise/)    | Whether the app meets the exercise in the root README: data loaded, filters correct, pages that scale. |

## Run an eval

1. Start Supabase and load the data. Start the app with `pnpm dev`, or `pnpm build && pnpm start`.
2. Run `pnpm evals:<eval> --out evals/runs/<name>`. `evals/runs/` is gitignored.

Each eval's README lists its flags and how long it takes.

## CI enforces a baseline

CI runs every eval against a fresh stack and compares the results with the eval's committed `baseline.json`, which lists each case as `pass` or `fail`. The check fails when:

- a case that passes in the baseline fails now (a regression), or
- a case that fails in the baseline passes now. Lock it in: rerun with `--write-baseline <file>` and commit the file, so it can never quietly fail again.

`--write-baseline` never turns a `pass` into a `fail` by itself. To accept a regression on purpose, add `--accept-regressions` and say why in the PR description.

## The shape of an eval

Every eval has the same layout, so a new one is easy to write and an old one is easy to run.

- `evals/<eval>/run.ts` is the entry point. Root `package.json` has `evals:<eval>`.
- `evals/<eval>/README.md` says what it measures, how to run it, and how to add a case.
- Cases are data in `cases.ts`. Each has an `id`, a `source` (the requirement it checks), and its parameters.
- Expected answers come from an independent source (for `exercise`, the CSV), never from the app's own code, so a bug cannot hide on both sides.
- Grading is plain functions in `grade.ts`, unit tested in `grade.test.ts`. `pnpm test:run` runs those tests.
- Flags: `--out <dir>` (required), `--case <id>` (repeatable), `--baseline <file>` to compare, `--write-baseline <file>` to update.
- A run writes `results.jsonl` and a `summary.md` for a person to `--out`.

## Rules for cases

- A case checks one requirement a person would notice. Name its source.
- Add the case before the fix. It must fail on the old code and pass on the new code.
- Prefer fixing the app over loosening a case. If a case changes, it must still fail on the code it was written against.
- Add controls: cases where the right answer is the ordinary one (no filter, every row). They catch a fix that overcorrects.
- Thresholds come from what a person notices (a page that takes seconds), not from what the current code happens to measure.
