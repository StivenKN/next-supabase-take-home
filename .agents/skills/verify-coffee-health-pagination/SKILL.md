---
name: verify-coffee-health-pagination
description: Check that the coffee_health table's filters, sort, and pages still show every matching row exactly once. Use before you push a change to lib/coffee-health/queries.ts, lib/coffee-health/search-params.ts, lib/coffee-health/schema.ts, the coffee_health schema or migration, or the pager links in components/explorer/, and whenever `pnpm verify:pagination` fails.
---

# Verify coffee_health pagination

## What it guarantees

**Property.** For any filters and sort a person can put in the URL, following the pager's links from page 1 to the last page shows every CSV row that matches the filters exactly once, in the chosen order. Every page reports the same match count, and a page past the end says so instead of showing rows.

**Harm if broken.** People silently see the wrong rows of the dataset: a row repeated on two pages, a row on no page, a wrong total, or a "next page" link that quietly changes the filters. Nothing on screen gives it away, and the evals in `evals/exercise/` only walk a dozen hand-picked filters in ID order.

## How it checks

`lib/coffee-health/pagination.verify.ts`, run by `pnpm verify:pagination` (Vitest with `vitest.verify.config.mts`, fast-check 4.10.2 pinned in `package.json`).

No verifier runs on TypeScript plus PostgREST plus Postgres, so this tests the real code with generated inputs. It is not a hand-written model, and it is not a proof. The data is read-only and nothing interleaves, so a model checker such as TLA+ has nothing to explore.

For each view it:

1. Turns the view into the link the app renders (`hrefForState`), reads it back the way the server does (`new URL(...).searchParams` into `parseSearchParams`), and checks that the filters and sort are unchanged.
2. Computes the expected rows and order from `data/synthetic_coffee_health_10000.csv` with its own filter code. It never calls the app's query code for expected answers.
3. Follows the link to every page, from 1 to the last, and calls the app's `getPage()` against the local Supabase stack. It checks each page's status, count, and row count, that no ID appears twice, that no matching ID is missing, that no extra ID appears, and that the IDs are in sort order.
4. Requests the page right after the last one, and a page three past it, and expects `out-of-range` with the right count. PostgREST answers these two differently (an empty page, or error `PGRST103`), and `getPage` handles each.

It walks these views:

- **Every sort, unfiltered.** All 8 `SORT_KEYS`, ascending and descending, 200 pages each. These are exhaustive.
- **Generated views.** 100 per run by default (`VERIFY_RUNS`), with a new random seed each run. Each view combines random choice filters (including country strings that match nothing, such as PostgREST syntax), ranges whose bounds are drawn from the CSV's values (so many sit exactly on a row's value), yes/no flags, and a random sort. About one view in five matches no rows. On failure, fast-check shrinks the view to a small one.

A run takes about 30 seconds and prints `Walked N views (M with no matching rows), P pages in all.`

## Scope and assumptions

Verified: `getPage`'s filtering, sorting, tiebreaking, offsets, counts, and past-the-end handling, together with the URL round trip the pager links take. It runs on the 10,000-row CSV, as loaded, for the views above.

Assumed (the check depends on these being true):

- `public.coffee_health` holds exactly the CSV's rows and does not change during a run. The first test checks the row count without going through app code. Paging with `offset` while rows are being inserted is not covered, and would skip or repeat rows by design.
- Country order in Postgres (database collation `en_US.UTF-8`) matches `localeCompare(..., "en")` for the 20 ASCII country names in the CSV.
- An empty multi-select means "no filter", range bounds are inclusive, and filters combine with `and`. These come from `## Submission notes`, "Filtering", in `README.md`.

Not covered:

- The HTML: whether the table renders the rows `getPage` returned. `evals/exercise` covers that.
- How the filter bar's controls build a state (`components/explorer/filter-bar.tsx`), `boundFromInput`, `pageWindow`, and `getSummary`.
- Tables larger than the CSV. The `scale/million-rows` eval covers paging at 1,000,000 rows, but not exhaustively.
- Network failures and the `error` status.

## Coverage record

| Code                                                                                                                             | Checked by                                 |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `lib/coffee-health/queries.ts`: `getPage`, `matching`                                                                            | steps 3 and 4                              |
| `lib/coffee-health/search-params.ts`: `parseSearchParams`, `parseChoices`, `serializeState`, `hrefForState`                      | steps 1 and 3                              |
| `lib/coffee-health/schema.ts`: `PAGE_SIZE`, `CHOICE_KEYS`, `RANGE_KEYS`, `RANGE_STEPS`, `FLAG_KEYS`, `SORT_KEYS`, `ENUM_OPTIONS` | the generator and the expected page sizes  |
| `supabase/schemas/coffee_health.sql` (column types, the `(column, id)` indexes, the read policy)                                 | indirectly, through every query            |
| `components/explorer/pagination.tsx`, `components/explorer/state-link.tsx` (`{ ...state, page }` passed to `hrefForState`)       | modeled by `followLink` in the verify file |

**Last confirmed in sync at commit `2e46943`** (main, "Load the coffee health dataset and show it in a filterable table (#15)").

To see whether the check needs another look, run:

```sh
git diff --stat 2e46943 -- lib/coffee-health/queries.ts lib/coffee-health/search-params.ts lib/coffee-health/schema.ts supabase/schemas/coffee_health.sql components/explorer/pagination.tsx components/explorer/state-link.tsx
```

Move the commit forward only after you have read every change in that diff, confirmed that the verify file still describes the code (same filter kinds, same link shape, same past-the-end statuses), and seen `pnpm verify:pagination` pass at the new commit. Update the commit and its title in this paragraph and in the command.

## Run it

Prerequisites: Docker running, the shared Supabase stack up, `.env.local` written, and the CSV loaded.

```sh
pnpm setup:env          # starts Supabase if needed, writes .env.local, loads the CSV if the table is empty
pnpm verify:pagination
```

- `VERIFY_RUNS=1000 pnpm verify:pagination` for a deeper run (about 3 minutes).
- `VERIFY_SEED=<seed> pnpm verify:pagination` replays a failure. fast-check prints the seed under `Property failed`.
- CI runs it in the `Supabase + build + smoke test` job, after `Load the dataset`.

Do not run `pnpm db:reset` or `supabase stop` just to get this check running, because other worktrees share the stack. If the table is empty, `pnpm db:load` reloads it.

## Read a failure

The message starts with the view in plain words and the app's link for it, then says what went wrong. For example:

```
[gender in ["Female"], coffee_intake 0.., smoking no, alcohol_consumption no, sorted by country descending]
(/?gender=Female&coffee_intake=0..&smoking=no&alcohol_consumption=no&sort=-country):
ID 4627 is shown on page 7 and again on page 8
```

Open the link in the running app (`pnpm dev:next`) to see the same pages.

**Setup, not a bug:** `Setup: expected public.coffee_health to hold the 10000 CSV rows`. The table is empty or has extra rows. A running `pnpm evals:exercise --scale` adds 990,000 rows for about 30 seconds, and another worktree may have reset the database. Run `pnpm db:load` and rerun.

**A real bug** is anything else while the precondition passes: a duplicate or missing ID, a wrong count, rows out of order, a link that reads back as a different view, or a past-the-end page that shows rows or the wrong count. Do not weaken the check to make it pass. Report the view, the link, and the message.

**A modeling error** is when the code is right and the verify file is out of date. Suspect one when:

- The change was intended. For example, a new filter kind (text search, a date range), a new meaning for an existing filter (exclusive bounds, empty multi-select meaning "none"), a new URL format, or a new past-the-end behaviour. Update `matches`, `describeState`, the generator, or the past-the-end step in the verify file to match the new rule, and say so in the pull request.
- The failure is only about country order, and the two countries differ in a way collations treat differently (accents, case, punctuation). Compare with `select country from public.coffee_health order by country` in the database container.
- The generator produced a view the app cannot reach. For example, `parseChoices` started rejecting a character that `junkCountry` still generates. Narrow the generator to match the parser and say why in a comment.

New `CHOICE_KEYS`, `RANGE_KEYS`, `FLAG_KEYS`, and `SORT_KEYS` entries are picked up without edits, as long as the column has the same name in the CSV header (lowercased).

## Proof that it can fail

At commit `2e46943`, each of these scratch changes to the real code made `pnpm verify:pagination` fail, and reverting it made the check pass again:

| Scratch change                                                                                 | Caught by                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queries.ts`: drop the `id` tiebreaker (`if (column !== "id") query = query.order("id", ...)`) | Generated views, within 5 views in each of 6 seeds. The unfiltered sorts still pass, because Postgres reads the `(column, id)` indexes in a stable order. |
| `queries.ts`: `.range(from, from + PAGE_SIZE)`, one row too many                               | Both                                                                                                                                                      |
| `queries.ts`: `lt` instead of `lte` for the max bound                                          | Generated views                                                                                                                                           |
| `queries.ts`: apply `.in(key, values)` even when nothing is ticked                             | Both                                                                                                                                                      |
| `queries.ts`: treat an empty page after the last as `ok`                                       | Both                                                                                                                                                      |
| `queries.ts`: report count 0 for `PGRST103`                                                    | Both                                                                                                                                                      |
| `search-params.ts`: leave descending ID sort out of the URL                                    | Both                                                                                                                                                      |
| `search-params.ts`: stop URL-encoding choice values                                            | Generated views, within 33 views in each of 6 seeds, through a junk country such as `#`                                                                   |

To prove it again after editing the verify file, make one of these scratch changes, run the check, see it fail with a readable message, and revert.
