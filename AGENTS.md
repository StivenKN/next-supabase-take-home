# Medallo take-home

This repo is a take-home exercise from Medallo.dev. The app is Next.js 16 with a local Supabase stack that runs in Docker. The Exercise section of `README.md` is the task: load `data/synthetic_coffee_health_10000.csv` into Postgres, show the rows in a filterable table, and design for millions of rows.

## Who you work for

- **You** means the agent that reads this file.
- **We** means the developer who submits this repo. We must explain every decision in a review.
- **The reviewers** are the Medallo.dev engineers who grade the submission. They are the users of this repo. A reviewer clones the repo, follows the README setup, opens the app, and reads the submission notes.

The rules in this file are defaults. Our instructions override them. If a rule blocks your task, say so and get our approval before you break the rule.

Make these statements true for the reviewers, and then keep them true:

- **The app works from a fresh clone.** The README setup must end with 10,000 loaded rows and a visible table. A fresh clone gets rows only from the migrations and `supabase/seed.sql`, or from a step that the README tells the reviewer to run. If your change adds a setup step, add the step to the README in English and in Spanish.
- **The design holds at millions of rows.** Filter, sort, page, and count in Postgres. Do not send the full dataset to the browser.
- **We can explain the code without you.** Choose the plain solution. When you add a dependency, say in the pull request body what the dependency replaces. Record each trade-off in the submission notes. The submission notes are two sections of `README.md`, `## Submission notes (English)` and `## Notas de entrega (Español)`. If a section does not exist, add it after the Exercise section in the same language.

## Other agents share your machine

Several agents work on this repo at the same time, each in a separate git worktree. The worktrees share these resources.

- **The Supabase stack.** `supabase/config.toml` sets `project_id = "take-home"` and fixed ports. Every worktree therefore uses the same containers and the same database. `pnpm exec supabase db reset` drops that database and rebuilds it from the migrations in your worktree. Run `pnpm exec supabase db reset` in two cases only. The first case is a task that changes the schema. The second case is a reset from another worktree that removed a table that your task needs. Do not run `pnpm exec supabase stop`, because the apps in the other worktrees lose their database.
- **The process list.** Other worktrees run `next dev` too. Never stop processes by name, as `pkill -f next` does. Stop only a process whose PID you recorded when you started the process. If you lost the PID, run `ss -H -ltnp "sport = :<port>"` with your port, and confirm that `/proc/<pid>/cwd` is your worktree. Stop your dev server before you finish.

## Supabase behavior to plan for

- **The API returns at most 1,000 rows.** `max_rows = 1000` in `supabase/config.toml` caps every response, even when the query sets a larger `limit`. A query for all 10,000 rows returns 1,000 rows and no error. Request one page per query. Get the total from a count, not from the length of the returned array. The paging method and the count method are design decisions, so record them in the submission notes. Do not raise `max_rows`.
- **A new table starts with row level security disabled.** The publishable key, which ships to the browser, can then read, insert, and delete every row. Enable row level security on each new table, as `supabase/schemas/notes.sql` does.
- **A table without a `select` policy returns `[]`.** When row level security is enabled and no `select` policy exists, the publishable key reads zero rows with status 200. Give each table that the app reads a `select` policy.
- **The publishable key cannot insert into a protected table.** The clients from `createClient()` read the publishable key from `NEXT_PUBLIC_SUPABASE_ANON_KEY`. On a table with row level security enabled, an insert with that key fails with error `42501` until the table has an `insert` policy. The secret key `SUPABASE_SECRET_KEY` skips row level security. `createAdminClient()` in `lib/supabase/server.ts` uses the secret key. Use the secret key only in server code. A direct Postgres connection on port 54322 as `postgres` also skips row level security. The migrations and `supabase/seed.sql` use that connection.
- **Column values have type `any`.** The clients in `lib/supabase/` have no `Database` type. Neither `pnpm typecheck` nor `pnpm lint` reports a wrong column type. Give each query result a row type.

## Next.js 16 behavior to plan for

- **The installed docs are the reference.** `node_modules/next/dist/docs/` holds the docs for the installed version. Read the page for an API before you use the API.
- **An uncached read outside `<Suspense>` fails the build.** `next.config.ts` sets `cacheComponents: true`. A page that awaits `searchParams`, `cookies()`, or a Supabase query at the top level stops `pnpm build` with `Uncached data was accessed outside of <Suspense>`. Read `searchParams` and query Supabase inside an async component. Wrap that component in `<Suspense>`.
- **`lib/supabase/proxy.ts` is not connected.** The repo has no root `proxy.ts`, so `updateSession()` never runs. Connect `updateSession()` only if the task needs sign-in. As written, `updateSession()` redirects each signed-out request to `/auth/login`, except for `/` and for paths that start with `/login` or `/auth`. The `/auth/login` route does not exist.
- **`next dev` rewrites the tracked file `next-env.d.ts`.** Run `git checkout next-env.d.ts` before you commit.

## Run the app

A new worktree has no `node_modules` directory and no `.env.local` file.

1. Run `pnpm install`.
2. Run `pnpm setup:env`. This command starts the Supabase stack if the stack is not running, and writes `.env.local`.
3. Run `pnpm dev:next`. The server uses port 3000. If another worktree holds port 3000, the server uses the next free port. Read the URL from the command output.

## Change the schema

The files in `supabase/schemas/` declare the schema. `supabase db reset` and the first `supabase start` apply the files in `supabase/migrations/`.

1. Edit or add a file in `supabase/schemas/`.
2. Run `pnpm exec supabase db diff -f <name>` to write the migration. The command starts a temporary Postgres container on port 54320, and every worktree uses that port. If the command fails with `port is already allocated`, another worktree is running a diff. The CLI then suggests `supabase stop --project-id take-home`. Do not run that command, because it stops the shared stack. Wait, and then run the diff again.
3. Read the migration. The diff tool can put statements in the wrong order.
4. A reset deletes each row that the migrations and `supabase/seed.sql` do not create. Run `pnpm exec supabase db reset`. This command applies every migration, and then applies `supabase/seed.sql`. If neither loads the CSV, load the CSV again.
5. Commit the schema file and the migration together.

The database container does not mount the repo. A `COPY ... FROM '<path>'` statement in a migration or in `supabase/seed.sql` therefore cannot read the CSV in `data/`.

## Verify before you push

CI runs these commands on every pull request. Run them first.

```bash
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
```

- CI also starts Supabase, which applies the migrations and `supabase/seed.sql`. The CI database holds the CSV rows only if a migration or `supabase/seed.sql` loads them. Then CI runs `supabase db lint` and builds the app.
- The last CI step requests the path `SMOKE_PATH` from the built app, and searches the HTML for the text `SMOKE_EXPECT`. Both values are in `.github/workflows/ci.yml`. If your change removes that text from the page, update both values.
- Vitest runs each file that matches `**/*.{test,spec}.{ts,tsx}`. Put a test file next to the code that the file tests.
- Test logic that can break, such as the code that turns URL parameters into a query. Do not test static markup, copy text, or behavior that the types guarantee.
- Passing checks do not prove the feature. Open the page in a browser with all 10,000 rows loaded. Compare the row count in Postgres with the CSV, apply each filter, and open a page past row 1,000.

## Pull requests

- Write the title as a plain statement of the change, as in `Add CI pipeline`. Merge with squash. GitHub names the commit on `main` after the title, unless the pull request has one commit. For a pull request with one commit, GitHub uses the message of that commit, so give that commit the same message as the title.
- Start the body with the problem in one or two sentences. Then describe the fix.
- If the change is visible in the app, attach a screenshot to the pull request. Do not commit the screenshot.
- Do not commit plans, research files, or scratch files.
- This repo is a fork of `medallo-dev/next-supabase-take-home`. Open each pull request against the fork, and pass `--repo` to `gh` with the repo that `git remote get-url origin` names. The reviewers can see a pull request against the upstream repo, and you cannot delete it.

## Code defaults

- Use a component from `components/ui/` before you write a new component.
- Write no comment by default. Write a comment only for a constraint that the code cannot show.
- Add a package with `pnpm add`. CI installs from `pnpm-lock.yaml` with `--frozen-lockfile`.
