# Exercise

Checks the app against the exercise in the [root README](../../README.md). The expected answer for every case is computed from `data/synthetic_coffee_health_10000.csv`, not from the app.

| Cases      | What passes                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| `data/*`   | The table holds the 10,000 CSV rows, with the same value in every column.                                  |
| `page/*`   | For each filter, the page shows exactly the matching rows in ID order, and the last page proves the total. |
| `input/*`  | A hostile filter value or a page far past the end still gets a page (no 5xx) and changes no data.          |
| `scale/*`  | The page sends one page of rows, not the dataset. At 1,000,000 rows, pages stay correct and answer in under 2 seconds. |

## Run

```sh
pnpm dev                 # or: pnpm build && pnpm start
pnpm evals:exercise --out evals/runs/local
pnpm evals:exercise --out evals/runs/local --case page/country --case page/combined
pnpm evals:exercise --out evals/runs/local --scale --baseline evals/exercise/baseline.json
```

- `--base-url <url>`: where the app runs. Default `http://localhost:3000`.
- `--scale`: also runs `scale/million-rows`. It copies the table 99 more times (shifted IDs), checks and times five pages, then deletes the copies. About 30 seconds. It changes your local database while it runs, so it is off by default. CI runs it.
- `--baseline <file>`: exit 1 when results differ from the file. See [CI enforces a baseline](../README.md#ci-enforces-a-baseline).
- `--write-baseline <file>`: update the file from this run. Skipped cases keep their entry.
- Database access runs `psql` inside the Supabase container (`supabase_db_<project_id>`), so only Docker is needed. `EVALS_DB_CONTAINER` overrides the name.
- Without `--scale` a run takes a few seconds.

## How the page is read

`page.ts` loads the server's HTML into jsdom and runs its inline scripts, so rows that React streams in after the table shell land where a browser puts them. Then it finds the visible table with an `ID` column and reads the IDs. A filter is checked page by page: results of up to three pages are walked in full; larger ones check pages 1, 2, and the last.

## When the app changes

`app.ts` is the only file that knows the app: table name, route, URL format for filters and pages, and the ID column's header. If the app renames one of those, update `app.ts`, not the cases. It builds URLs itself on purpose, instead of importing the app's URL code, so a bug there fails a case instead of being shared.

## Add a case

Add an entry to `CASES` in `cases.ts` with an `id`, the README requirement it checks as `source`, and a one-line `what`. A `page` case only needs a `filter`; the expected rows come from the CSV. Run it against the current app, then add it to `baseline.json` with `--write-baseline`. If the data has to cooperate for the case to mean anything (rows exactly on a bound, say), assert that in `grade.test.ts`.
