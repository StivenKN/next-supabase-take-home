---
name: verify-coffee-health-pagination
description: Check that the coffee_health table's filters, sort, and pages still show every matching row exactly once. Use before you push a change to lib/coffee-health/queries.ts, lib/coffee-health/search-params.ts, lib/coffee-health/schema.ts, the coffee_health schema or migration, the URL handling in components/explorer/ (explorer-page.tsx, explorer-context.tsx, pagination.tsx, state-link.tsx), and whenever `pnpm verify:pagination` fails.
---

# Verify coffee_health pagination

## What it guarantees

**Property.** For any filters and sort a person can put in the URL, following the links the app builds for pages 1 to the last (`hrefForState` with `{ ...state, page }`) shows every CSV row that matches the filters exactly once, in the chosen order. Every page reports the same match count, and a page past the end says so instead of showing rows.

**Harm if broken.** People silently see the wrong rows of the dataset: a row repeated on two pages, a row on no page, a wrong total, or a "next page" link that quietly changes the filters. Nothing on screen gives it away, and the evals in `evals/exercise/` only walk a dozen hand-picked filters in ID order.

## How it checks

`lib/coffee-health/pagination.verify.ts`, run by `pnpm verify:pagination` (Vitest with `vitest.verify.config.mts`, fast-check 4.10.2 pinned in `package.json`).

No verifier runs on TypeScript plus PostgREST plus Postgres, so this tests the real code with generated inputs. It is not a hand-written model, and it is not a proof. The data is read-only and nothing interleaves, so a model checker such as TLA+ has nothing to explore.

For each view it:

1. Turns the view into the link the app renders (`hrefForState`), reads it back the way the server does (`new URL(...).searchParams` into `parseSearchParams`), and checks that the filters and sort are unchanged.
2. Computes the expected rows from `data/synthetic_coffee_health_10000.csv` with its own filter code (`matches`). It never calls the app's query code for expected answers. It shares only the key lists, `ENUM_OPTIONS`, `RANGE_STEPS`, `DEFAULT_STATE`, and `PAGE_SIZE` with the app.
3. Follows the link to every page, from 1 to the last, and calls the app's `getPage()` against the local Supabase stack. It checks each page's status, count, and row count, that no ID appears twice, that no matching ID is missing, that no extra ID appears, and that the IDs are in sort order.
4. Requests the page right after the last one, and a page three past it, and expects `out-of-range` with the right count. `getPage` handles two PostgREST answers here: an empty page when the offset equals the match count, and error `PGRST103` when it is larger. The empty page only happens when the match count is a multiple of 50, so the unfiltered walks (10,000 rows) are what reliably reach it.

It walks these views:

- **Every sort, unfiltered.** All 8 `SORT_KEYS`, ascending and descending, 200 pages each. These are exhaustive.
- **Fixed boundary views** (`boundaryViews`), the same on every run: for each range a max of 0, min equal to max on the lowest and on the highest value, open-ended bounds at those values, and an inverted range; each flag on its own; the first two values of each choice filter, one at a time; and country values that need URL encoding (`#`, `&`, `%`, `+`, a space) or look like PostgREST syntax. Sorts rotate through `SORT_KEYS`, ascending on the first pass and descending on the next.
- **Generated views.** 100 per run by default (`VERIFY_RUNS`), with a new random seed each run. Each view combines random choice filters (including country strings that match nothing), ranges whose bounds are drawn from the CSV's values (so many sit exactly on a row's value), yes/no flags, and a random sort. Between 15 and 35 percent of them match no rows. On failure, fast-check shrinks the view to a small one.

A run takes 30 to 60 seconds, depending on machine load, and prints `Walked N views (M with no matching rows), P pages in all.` for the generated views.

## Scope and assumptions

Verified: `getPage`'s filtering, sorting, tiebreaking, offsets, counts, and past-the-end handling, together with the URL round trip that page links and `navigate` take (`hrefForState`, then `parseSearchParams` as `explorer-page.tsx` calls it). It runs on the 10,000-row CSV, as loaded, for the views above.

Assumed (the check depends on these being true):

- `public.coffee_health` holds exactly the CSV's rows and does not change during a run. The first test checks the row count without going through app code. Paging with `offset` while rows are being inserted is not covered, and would skip or repeat rows by design.
- Country order in Postgres (ICU collation, locale `en-US`) matches `localeCompare(..., "en")` for the 20 ASCII country names in the CSV.
- An empty multi-select means "no filter", range bounds are inclusive, and filters combine with `and`. These come from `## Submission notes`, "Filtering", in `README.md`.

Not covered:

- The HTML: whether the table renders the rows `getPage` returned. `evals/exercise` covers that.
- How the filter bar's controls build a state (`components/explorer/filter-bar.tsx`), `boundFromInput`, `pageWindow`, and `getSummary`.
- The pager component itself. The check builds each page's link the way `components/explorer/pagination.tsx` does (`{ ...state, page }` into `hrefForState`), but does not render it. A pager that linked to a different state would pass this check and the evals.
- Tables larger than the CSV. The `scale/million-rows` eval covers paging at 1,000,000 rows, but not exhaustively.
- Network failures and the `error` status.

## Coverage record

| Code                                                                                                                             | Checked by                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `lib/coffee-health/queries.ts`: `getPage`, `matching`                                                                            | steps 3 and 4                                                                 |
| `lib/coffee-health/search-params.ts`: `parseSearchParams`, `parseChoices`, `serializeState`, `hrefForState`                      | steps 1 and 3                                                                 |
| `lib/coffee-health/schema.ts`: `PAGE_SIZE`, `CHOICE_KEYS`, `RANGE_KEYS`, `RANGE_STEPS`, `FLAG_KEYS`, `SORT_KEYS`, `ENUM_OPTIONS` | the generator and the expected page sizes                                     |
| `supabase/schemas/coffee_health.sql` (column types, the `(column, id)` indexes, the read policy)                                 | indirectly, through every query                                               |
| `components/explorer/pagination.tsx`, `components/explorer/state-link.tsx` (`{ ...state, page }` passed to `hrefForState`)       | modeled by `followLink` in the verify file                                    |
| `components/explorer/explorer-context.tsx`: `navigate` (`hrefForState`, then `router.push`)                                      | modeled by `followLink` in the verify file                                    |
| `components/explorer/explorer-page.tsx`: `parseSearchParams(await searchParams)` passed to `getPage`                             | modeled by `followLink` in the verify file                                    |
| `data/synthetic_coffee_health_10000.csv`                                                                                         | the expected rows, the country list, and the range bounds the generator draws |

**Last confirmed in sync at commit `2e46943`** (main, "Load the coffee health dataset and show it in a filterable table (#15)").

To see whether the check needs another look, run:

```sh
git diff --stat 2e46943 -- lib/coffee-health/queries.ts lib/coffee-health/search-params.ts lib/coffee-health/schema.ts supabase/schemas/coffee_health.sql components/explorer/pagination.tsx components/explorer/state-link.tsx components/explorer/explorer-context.tsx components/explorer/explorer-page.tsx data/synthetic_coffee_health_10000.csv
```

Move the commit forward only after you have read every change in that diff, confirmed that the verify file still describes the code (same filter kinds, same link shape, the page still passes the parsed URL straight to `getPage`, same past-the-end statuses), and seen `pnpm verify:pagination` pass at the new commit. Update the commit and its title in this paragraph and in the command.

## Run it

Prerequisites: Docker running, the shared Supabase stack up, `.env.local` written, and the CSV loaded.

```sh
pnpm setup:env          # starts Supabase if needed, writes .env.local, loads the CSV if the table is empty
pnpm verify:pagination
```

- `VERIFY_RUNS=1000 pnpm verify:pagination` for a deeper run (3 to 4 minutes).
- `VERIFY_SEED=<seed> pnpm verify:pagination` replays a failure. fast-check prints the seed under `Property failed`.
- CI runs it in the `Supabase + build + smoke test` job, after `Load the dataset`.

Do not run `pnpm db:reset` or `supabase stop` just to get this check running, because other worktrees share the stack. If the table is empty, `pnpm db:load` reloads it.

## Read a failure

The message starts with the view in plain words and the app's link for it, then says what went wrong. In the generated test, fast-check prints `Property failed after N tests`, the seed, and the view as JSON first, and this message follows on the `Caused by:` line. For example:

```
[gender in ["Female"], coffee_intake 0.., smoking no, alcohol_consumption no, sorted by country descending]
(/?gender=Female&coffee_intake=0..&smoking=no&alcohol_consumption=no&sort=-country):
ID 4627 is shown on page 7 and again on page 8
```

Open the link in the running app (`pnpm dev:next`) to see the same pages.

**Setup, not a bug:** any message (or `Caused by:` line) that starts with `Setup:`. The check counts the table before the walks and again after any failed walk, without the app's query code, and says what it found: `.env.local` missing, no answer from Supabase, an empty table, or extra rows. A running `pnpm evals:exercise --scale` adds 990,000 rows for about 30 seconds, and another worktree may have reset the database. Write `.env.local` with `pnpm setup:env`, load the CSV with `pnpm db:load` if needed, and rerun. If rows were added and removed again between the failed page and the recount, a setup problem can still read as a bug, so rerun once before you report one.

**A real bug** is any other failure: a duplicate or missing ID, a wrong count, rows out of order, a link that reads back as a different view, or a past-the-end page that shows rows or the wrong count. Do not weaken the check to make it pass. Report the view, the link, and the message.

**A modeling error** is when the code is right and the verify file is out of date. Suspect one when:

- The change was intended. For example, a new filter kind (text search, a date range), a new meaning for an existing filter (exclusive bounds, empty multi-select meaning "none"), a new URL format, or a new past-the-end behaviour. Update `matches`, `describeState`, the generator, or the past-the-end step in the verify file to match the new rule, and say so in the pull request.
- The failure is only about country order, and the two countries differ in a way collations treat differently (accents, case, punctuation). Compare with `docker exec supabase_db_take-home psql -U postgres -c "select distinct country from public.coffee_health order by country"`.
- The generator produced a view the app cannot reach. For example, `parseChoices` started rejecting a character that `junkCountry` still generates. Narrow the generator to match the parser and say why in a comment.

New `RANGE_KEYS` and `FLAG_KEYS` entries, numeric `SORT_KEYS` entries, and new `CHOICE_KEYS` entries backed by an enum in `ENUM_OPTIONS`, are picked up without edits, as long as the column has the same name in the CSV header (lowercased). A new free-text choice key, like country, makes the check throw until you give it values in `choiceOptions`. A new enum sort key (such as `stress_level`) fails on correct code: Postgres orders enums by declaration, and `compareKeys` compares text. Make `compareKeys` order that column by its index in `ENUM_OPTIONS`.

## Proof that it can fail

With the app code at `2e46943` (this change does not touch it) and the verify file as committed, each of these scratch changes to the real code made `pnpm verify:pagination` fail, and reverting it made the check pass again. "Yes" means that test failed. The unfiltered and fixed tests walk the same views every run, so they give the same result each time, except for the tiebreaker row: whether a missing tiebreaker shows depends on the query plan Postgres picks. The generated column is one run, so it can vary.

| Scratch change                                                                                 | Unfiltered | Fixed | Generated |
| ---------------------------------------------------------------------------------------------- | ---------- | ----- | --------- |
| `queries.ts`: drop the `id` tiebreaker (`if (column !== "id") query = query.order("id", ...)`) | no         | yes   | yes       |
| `queries.ts`: `.range(from, from + PAGE_SIZE)`, one row too many                               | yes        | yes   | yes       |
| `queries.ts`: `lt` instead of `lte` for the max bound                                          | no         | yes   | yes       |
| `queries.ts`: `if (max)` instead of `if (max !== null)`, so a max of 0 is ignored              | no         | yes   | no        |
| `queries.ts`: apply `.in(key, values)` even when nothing is ticked                             | yes        | yes   | yes       |
| `queries.ts`: treat an empty page after the last as `ok`                                       | yes        | yes   | yes       |
| `queries.ts`: report count 0 for `PGRST103`                                                    | yes        | yes   | yes       |
| `search-params.ts`: leave descending ID sort out of the URL                                    | yes        | yes   | yes       |
| `search-params.ts`: stop URL-encoding choice values                                            | no         | yes   | yes       |
| `search-params.ts`: keep at most 5 countries instead of `MAX_CHOICES`                          | no         | no    | yes       |

The unfiltered sorts miss the dropped tiebreaker because Postgres reads the `(column, id)` indexes in a stable order when nothing is filtered. Filtered views make it choose other plans.

`if (min)` instead of `if (min !== null)` passes, and should: every range column is non-negative, so a min of 0 filters nothing either way.

To prove it again after editing the verify file, make one of these scratch changes, run the check, see it fail with a readable message, and revert.
