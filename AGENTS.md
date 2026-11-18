# Medallo take-home

This repo is a take-home exercise from Medallo.dev. The app is Next.js 16 with a local Supabase stack that runs in Docker. The Exercise section of `README.md` is the task: load `data/synthetic_coffee_health_10000.csv` into Postgres, show the rows in a filterable table, and design for millions of rows.

The rules in this file are defaults. The developer's instructions override them. If a rule blocks your task, say so and get approval before you break the rule.

## Who you work for

- **You** are the agent that reads this file.
- **We** are the developer who submits this repo and who must explain every decision in a review.
- **The reviewers** are the Medallo.dev engineers who grade the submission. They are the users of this repo. A reviewer clones the repo, follows the README setup, opens the app, and reads our notes.

Keep these statements true for the reviewers:

- **The app works from a fresh clone.** The README setup must end with 10,000 loaded rows and a visible table. If your change adds a setup step, add the step to the README in English and in Spanish.
- **The design holds at millions of rows.** Filter, sort, page, and count in Postgres. Do not send the full dataset to the browser.
- **We can explain the code without you.** Choose the plain solution. Before you add a dependency, state what the dependency replaces. Record each trade-off in the notes that the README asks for.

## Other agents share your machine

Several agents work on this repo at the same time, each in a separate git worktree. The worktrees share two resources.

- **The Supabase stack.** `supabase/config.toml` sets one project name, `take-home`, and fixed ports. Every worktree therefore uses the same containers and the same database. `pnpm exec supabase db reset` drops that database and rebuilds it from the migrations in your worktree. Run `db reset` only when your task changes the schema. Do not run `pnpm exec supabase stop`, because the apps in the other worktrees lose their database.
- **The process list.** Other worktrees run `next dev` too. Stop only a process whose PID you recorded when you started the process. Never stop processes by name, as `pkill -f next` does.

## Supabase returns partial or empty data without an error

- **The API returns at most 1,000 rows.** `max_rows = 1000` in `supabase/config.toml` caps every response, even when the query sets a larger `limit`. A query for all 10,000 rows returns 1,000 rows and no error. Request one page with `.range()`, and pass a `count` option to `.select()` to get the total. Do not raise `max_rows`.
- **A table without a policy returns `[]`.** When row level security is enabled and no `select` policy exists, the publishable key reads zero rows with status 200. Give each new table a `select` policy, as `supabase/schemas/notes.sql` does. Keep row level security enabled.
- **Only the secret key skips row level security.** `createAdminClient()` in `lib/supabase/server.ts` uses `SUPABASE_SECRET_KEY`. Call `createAdminClient()` only from server code. The other clients use the publishable key, and their writes fail with error `42501` until the table has an `insert` policy.

## Next.js 16 behavior to plan for

- **The installed docs are the reference.** `node_modules/next/dist/docs/` holds the docs for the installed version. Read the page for an API before you use the API.
- **An uncached read outside `<Suspense>` fails the build.** `next.config.ts` sets `cacheComponents: true`. A page that awaits a Supabase query at the top level stops `pnpm build` with `Uncached data was accessed outside of <Suspense>`. Read `searchParams` and query Supabase inside an async component, and wrap that component in `<Suspense>`.
- **`lib/supabase/proxy.ts` is not connected.** The repo has no root `proxy.ts`, so `updateSession()` never runs. Connect `updateSession()` only if the task needs sign-in. As written, `updateSession()` redirects each signed-out request for a path other than `/` to `/auth/login`, and that route does not exist.
- **`next dev` rewrites the tracked file `next-env.d.ts`.** Run `git checkout next-env.d.ts` before you commit.

## Run the app

A new worktree has no `node_modules` directory and no `.env.local` file.

1. Run `pnpm install`.
2. Run `pnpm setup:env`. This command starts the Supabase stack if the stack is not running, and writes `.env.local`.
3. Run `pnpm dev:next`. The server uses port 3000. If another worktree holds port 3000, the server uses the next free port. Read the URL from the command output.

## Change the schema

The files in `supabase/schemas/` declare the schema. The database runs the files in `supabase/migrations/`.

1. Edit or add a file in `supabase/schemas/`.
2. Run `pnpm exec supabase db diff -f <name>` to write the migration.
3. Read the migration. The diff tool can put statements in the wrong order.
4. Run `pnpm exec supabase db reset`. This command applies every migration, and then applies `supabase/seed.sql`. A reset deletes each row that the migrations and `supabase/seed.sql` do not create, so load the CSV again.
5. Commit the schema file and the migration together.

## Verify before you push

CI runs these commands on every pull request. Run them first.

```bash
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
```

- CI also starts Supabase with an empty database, runs `supabase db lint`, and requests `/` from the built app. The steps are in `.github/workflows/ci.yml`.
- Vitest runs each file that matches `**/*.{test,spec}.{ts,tsx}`. Put a test file next to the code that the file tests.
- Test logic that can break, such as the code that turns URL parameters into a query. Do not test static markup, copy text, or behavior that the types guarantee.
- Passing checks do not prove the feature. Open the page in a browser with all 10,000 rows loaded. Compare the row count in Postgres with the CSV, apply each filter, and open a page past row 1,000.

## Pull requests

- Write the title as a plain statement of the change, as in `Add CI pipeline`. Squash-merge, so the title becomes the commit message on `main`.
- Start the body with the problem in one or two sentences. Then describe the fix.
- If a reviewer can see the change in the app, attach a screenshot to the pull request. Do not commit the screenshot.
- Do not commit plans, research notes, or scratch files.

## Code defaults

- Use a component from `components/ui/` before you write a new component.
- Let TypeScript infer types. Do not use `any`.
- Write no comment by default. Write a comment only for a constraint that the code cannot show.
- Add a package with `pnpm add`. CI installs from `pnpm-lock.yaml` with `--frozen-lockfile`.
