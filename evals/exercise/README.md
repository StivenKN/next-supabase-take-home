# Exercise

Checks the app against the exercise in the [root README](../../README.md). The expected answer for every case is computed from `data/synthetic_coffee_health_10000.csv`, not from the app.

| Cases      | What passes                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| `data/*`   | The table holds the 10,000 CSV rows, with the same value in every column.                                  |
| `page/*`   | For each filter, the page shows exactly the matching rows in ID order, and the page after the last shows no rows, which proves the total. `page/row-values` checks that rows show their CSV values. |
| `input/*`  | A hostile filter value matches nothing, and a page past the end (right after the last, or far past it) says it has no rows. Neither changes data. |
| `scale/*`  | `page-weight`: the page sends one page of rows, not the dataset. `million-rows` (only with `--scale`): at 1,000,000 rows, pages stay correct and answer in under 2 seconds. |

## Run

```sh
pnpm dev                 # or: pnpm build && pnpm start
pnpm evals:exercise --out evals/runs/local
pnpm evals:exercise --out evals/runs/local --case page/country --case page/combined
pnpm evals:exercise --out evals/runs/local --scale --baseline evals/exercise/baseline.json
```

- `--base-url <url>`: where the app runs. Default `http://localhost:3000`.
- `--scale`: also runs `scale/million-rows`. It copies the table 99 more times (shifted IDs), checks and times five pages, then deletes the copies, also on Ctrl-C. About 30 seconds. It changes your local database while it runs, so it is off by default. CI runs it.
- `--baseline <file>`: exit 1 when results differ from the file. See [CI enforces a baseline](../README.md#ci-enforces-a-baseline).
- `--write-baseline <file>`: update the file from this run. Skipped cases keep their entry, and a case that passed before stays `pass` (the run exits 1) unless you add `--accept-regressions`.
- Database access runs `psql` inside the Supabase container (`supabase_db_<project_id>`), so only Docker is needed. `EVALS_DB_CONTAINER` overrides the name.
- Without `--scale` a run takes a few seconds. Every request times out after 30 seconds.
- Exit codes: 0 done (and matches the baseline, if given), 1 differs from the baseline, 2 setup problem (no database container, nothing answering at the URL, unreadable baseline).

## How the page is read

`page.ts` loads the server's HTML into jsdom and runs its inline scripts, so rows that React streams in after the table shell land where a browser puts them. Then it finds the visible table with an `ID` column and reads the IDs. When no rows are expected, the page must also show a message saying so; an error page or a stuck loading state does not count. A filter is checked page by page: results of up to three pages are walked in full; larger ones check pages 1, 2, and the last. Then the page after the last must show no rows.

## When the app changes

`app.ts` is the only file that knows the app: table name, route, URL format for filters and pages, the ID column's header, and the message shown when there are no rows. If the app renames one of those, update `app.ts`, not the cases. It builds URLs itself on purpose, instead of importing the app's URL code, so a bug there fails a case instead of being shared.

## Add a case

Add an entry to `CASES` in `cases.ts` with an `id`, the README requirement it checks as `source`, and a one-line `what`. A `page` case only needs a `filter`; the expected rows come from the CSV. Run it against the current app, then add it to `baseline.json` with `--write-baseline`. If the data has to cooperate for the case to mean anything (rows exactly on a bound, say), assert that in `grade.test.ts`.
