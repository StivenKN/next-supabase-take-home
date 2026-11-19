# Medallo Take Home

Next.js app with local [Supabase](https://supabase.com) development via Docker.

---

## Setup (English)

### System requirements

Install the following before working on this repository:

| Requirement                       | Version       | Install                                                           |
| --------------------------------- | ------------- | ----------------------------------------------------------------- |
| [Node.js](https://nodejs.org/)    | 24 or later   | [nodejs.org/en/download](https://nodejs.org/en/download)          |
| [Docker](https://www.docker.com/) | Latest stable | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |
| [pnpm](https://pnpm.io/)          | 10 or later   | [pnpm.io/installation](https://pnpm.io/installation)              |

Docker must be running before you start the development server. Supabase runs locally in Docker containers.

Verify your versions:

```bash
node --version   # v24.x or later
docker --version
pnpm --version   # 10.x or later
```

### Installation

1. Clone the repository and enter the project directory:

   ```bash
   git clone <repository-url>
   cd take-home
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Set up environment variables by running the setup script:

   ```bash
   pnpm setup:env
   ```

   This starts local Supabase, reads credentials from `supabase status -o env`, writes them to `.env.local`, and loads `data/synthetic_coffee_health_10000.csv` into the `coffee_health` table if the table is empty:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SECRET_KEY=
   ```

   `.env.local` is gitignored and is the file Next.js loads at development time. Do not commit secrets.

   To configure manually instead, start Supabase with `pnpm dev:supabase`, copy `.env.example` to `.env.local`, fill in the values yourself, and then run `pnpm db:load` to load the CSV.

Shortcut: `pnpm bootstrap` runs steps 2 and 3 in one go. It checks Node.js and pnpm, installs dependencies, then checks that Docker is running before starting Supabase, writing `.env.local`, and loading the CSV if the table is empty. It is safe to re-run.

### Running the app

Start Supabase and the Next.js dev server together:

```bash
pnpm dev
```

This runs `supabase start` and `next dev` concurrently. Open [http://localhost:3000](http://localhost:3000) once both services are ready.

To run services separately:

```bash
pnpm dev:supabase   # Start local Supabase (Docker)
pnpm dev:next       # Start Next.js only
```

### Other commands

```bash
pnpm bootstrap   # Check prerequisites, install, start Supabase, write .env.local, load the CSV
pnpm setup:env   # Start Supabase, write .env.local, load the CSV if the table is empty
pnpm db:reset    # Recreate the local database from migrations and seed.sql, then load the CSV
pnpm db:load     # Reload the CSV into coffee_health
pnpm check       # Format check, lint, typecheck and unit tests
pnpm build       # Production build
pnpm start       # Run production server
pnpm lint        # Run ESLint
pnpm format      # Format files with Oxfmt
pnpm test        # Run tests in watch mode
pnpm test:run    # Run tests once
```

### Working in T3 Code

[`t3.json`](t3.json) declares this repository's actions for [T3 Code](https://t3.codes). Import them once per machine: open **Settings → Projects**, pick this project, and under Actions use **Import scripts** once for each action. You can also import them from a thread's actions menu, under **From t3.json**. Importing copies them into your T3 Code settings and skips any action whose name or command you already have, so when an action in `t3.json` changes, edit it in T3 Code's settings, or delete it and import it again.

| Action | Command                                                       | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup  | `pnpm run --if-present bootstrap --continue-without-supabase` | Runs when T3 Code creates a worktree. The agent waits until it finishes, so it starts with dependencies installed, Supabase running and `.env.local` written. If Docker is not running or Supabase fails to start, Setup still installs dependencies and lets the agent start; fix the problem and run `pnpm setup:env`. On branches without `bootstrap`, Setup skips Supabase and `.env.local` and still lets the agent start, after pnpm 11+ has installed dependencies. |
| Dev    | `pnpm dev`                                                    | Starts Supabase and Next.js. Open the app from the thread details card, which lists the ports this thread's terminals started. Stops when the thread settles.                                                                                                                                                                                                                                                                                                              |
| Check  | `pnpm check`                                                  | Format check, lint, typecheck and unit tests, the same steps as CI's first job.                                                                                                                                                                                                                                                                                                                                                                                            |
| Test   | `pnpm test`                                                   | Vitest in watch mode. Stops when the thread settles.                                                                                                                                                                                                                                                                                                                                                                                                                       |

Every worktree uses the same local Supabase stack, because `project_id` and the ports in `supabase/config.toml` are fixed. A worktree's migrations reach the database only when you run `pnpm db:reset` from that worktree, and that replaces the data every other worktree sees, which is why it is not a one-click action. Next.js serves on port 3000, or on the next free port when another worktree's dev server already holds it, so use the port T3 Code lists for this thread rather than assuming 3000.

---

## Exercise (English)

After completing setup, build a feature that loads the coffee health dataset into Supabase and displays it in a filterable table in the Next.js app.

### Dataset

The file `data/synthetic_coffee_health_10000.csv` contains **10,000 rows** of synthetic health and coffee consumption data. Each row has these columns:

| Column                    | Type             |
| ------------------------- | ---------------- |
| `ID`                      | integer          |
| `Age`                     | integer          |
| `Gender`                  | text             |
| `Country`                 | text             |
| `Coffee_Intake`           | decimal          |
| `Caffeine_mg`             | decimal          |
| `Sleep_Hours`             | decimal          |
| `Sleep_Quality`           | text             |
| `BMI`                     | decimal          |
| `Heart_Rate`              | integer          |
| `Stress_Level`            | text             |
| `Physical_Activity_Hours` | decimal          |
| `Health_Issues`           | text             |
| `Occupation`              | text             |
| `Smoking`                 | integer (0 or 1) |
| `Alcohol_Consumption`     | integer (0 or 1) |

### Part 1 — Load the data into Supabase

1. Design a Postgres table (or tables) that stores this dataset. Add a migration under `supabase/migrations/` and/or a schema file under `supabase/schemas/`.
2. Load all 10,000 rows from the CSV into your local database. You may use any reasonable approach — for example, a seed script, a one-off loader script, or Postgres `COPY`.
3. Apply your changes locally:

   ```bash
   pnpx supabase db reset   # runs migrations and seed.sql
   ```

   Or run only the steps you need (`supabase migration up`, custom import script, etc.).

4. Verify the row count in the database matches the CSV (10,000 rows).

The starter project includes a sample `notes` table and Supabase client helpers in `lib/supabase/`. You can keep, replace, or extend these as you see fit.

### Part 2 — Render a filterable table in Next.js

Build a page in the Next.js app that displays the loaded data in a table and lets the user filter it.

At minimum, support filtering on a few meaningful columns — for example, country, gender, sleep quality, stress level, or numeric ranges (age, coffee intake, BMI). You decide which filters are most useful and how they should behave (exact match, multi-select, min/max, etc.).

UI components are available in `components/ui/` (including `table`, `input`, `button`, and others). Use them or replace them with your own.

### Part 3 — Think about scale

10,000 rows is small for Postgres but large enough to expose naive UI and query patterns. **Design with scale in mind** — assume the dataset could grow to hundreds of thousands or millions of rows.

Document any trade-offs or assumptions in your submission. We are interested in how you reason about performance, not in one specific library choice.

### Using AI

AI-assisted development is welcome. You may use coding assistants, chatbots, or other AI tools while working on this exercise.

During review, we will assume you understand your submission and can explain your approach — why you made certain choices, how the solution works, and what trade-offs you considered. Use AI however helps you, but make sure you could walk us through the code without it.

### What to deliver

- Working local setup: data loaded, table visible at [http://localhost:3000](http://localhost:3000) (or a route you add).
- Brief notes on your schema, import approach, filtering strategy, and scale decisions.

---

## Submission notes (English)

### Run it

The setup steps above are all it takes. `pnpm setup:env` starts Supabase, which applies the migrations, and then loads the CSV when the table is empty. After `pnpm dev`, the table is at [http://localhost:3000](http://localhost:3000) in English and at [http://localhost:3000/es](http://localhost:3000/es) in Spanish.

The exercise's `pnpx supabase db reset` on its own recreates the table and leaves it empty, because it cannot read the CSV. `pnpm db:reset` runs the pinned CLI's `supabase db reset` and then the loader. If the table is missing or empty, the page says so and shows that command.

### Schema

One table, `public.coffee_health`, with one row per respondent and the CSV's 16 columns in snake_case. It is defined in [supabase/schemas/coffee_health.sql](supabase/schemas/coffee_health.sql). The migration under `supabase/migrations/` came from `supabase db diff`, plus a hand-written tail for the table comment and privileges, which the diff tool does not emit.

| Column                                                                          | Type                       | Why                                                                                                                                                             |
| ------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                            | `integer` primary key      | The CSV already has a unique id.                                                                                                                                |
| `age`, `heart_rate`                                                             | `smallint`                 | Two bytes are enough.                                                                                                                                           |
| `coffee_intake`, `caffeine_mg`, `sleep_hours`, `bmi`, `physical_activity_hours` | `numeric` with one decimal | The CSV has one decimal. `numeric` keeps 5.3 as 5.3, which `real` does not guarantee.                                                                           |
| `gender`, `occupation`, `sleep_quality`, `stress_level`, `health_issues`        | Postgres enums             | Closed answer sets. An enum costs four bytes, rejects a misspelled value at load time, and sorts in declared order, so Poor comes before Fair, Good, Excellent. |
| `country`                                                                       | `text`                     | An open set. A new country should load without a migration.                                                                                                     |
| `smoking`, `alcohol_consumption`                                                | `boolean`                  | The CSV's 0 and 1.                                                                                                                                              |

Every column is `not null` and the numeric columns have range checks, so a bad row stops the load.

I kept one wide table and did not split countries or occupations into lookup tables. The rows are narrow, about 110 bytes each, and a join on every page request would cost more than the bytes it saves.

Row level security is on, with one `select` policy. The `anon` and `authenticated` roles can `select` and nothing else. I checked that an insert through the API with the publishable key returns 401.

### Import

[scripts/load-coffee-health.sh](scripts/load-coffee-health.sh) (`pnpm db:load`) streams the CSV into Postgres with `COPY`, through `psql` inside the Supabase database container, so it needs nothing installed beyond Docker.

- It compares the CSV header with the expected column list first. `COPY` maps columns by position, so a reordered file would otherwise load into the wrong columns without an error.
- `truncate`, `copy`, and a row-count check run in one transaction. If the copy fails, or the table's count differs from the file's, the transaction rolls back and the previous rows stay. Running the script twice gives the same result.
- It then runs `analyze`.

The load takes about 0.3 seconds for 10,000 rows. To check it, I exported the table back to CSV and diffed it against the source file. The two are identical. CI runs the same loader against a fresh database on every pull request.

I did not use `seed.sql`. The database container does not mount the repository, so a seed file cannot `COPY` from the CSV. The seed would have to be 10,000 generated `insert` rows committed next to the CSV they duplicate. `COPY` from the client is also the method that still works at millions of rows.

### Filtering

The URL holds all state, for example `/?country=Brazil,Germany&age=30..50&smoking=yes&sort=-caffeine_mg&page=2`. A view is a link you can share, the back button undoes a filter, and the server renders the page with no client-side data fetching. Parsing lives in [lib/coffee-health/search-params.ts](lib/coffee-health/search-params.ts) and has unit tests. It drops anything it does not understand.

| Filter                    | Columns                                                           | Behaviour                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Pick any number of values | country, gender, occupation, sleep quality, stress, health issues | Rows matching any ticked value (`in`).                                                                                         |
| Minimum and maximum       | age, coffee, sleep, BMI                                           | Inclusive. Either side can be empty. Applied with the Apply button or Enter, so a half-typed number does not reload the table. |
| Yes or no                 | smokes, drinks alcohol                                            | Exact match.                                                                                                                   |

Filters combine with `and`. Changing a filter returns to page 1.

Postgres does the filtering, sorting, paging, and counting through one PostgREST request built in [lib/coffee-health/queries.ts](lib/coffee-health/queries.ts).

- **Paging method.** Numbered pages of 50 rows with `limit` and `offset`. The browser never receives more than one page, whatever the table size. The API's cap of 1,000 rows per response (`max_rows`) is untouched and never reached.
- **Count method.** PostgREST's exact count (`count: "exact"`), which runs `count(*)` over the filtered rows in the same request. The pager needs it to show the last page number.

Both choices are the simple ones, and both have a cost at scale that the next section measures.

The country list, the total row count, and the min and max of each range come from one SQL function, `coffee_health_summary()`. Its result does not depend on the filters, so Next.js caches it with `"use cache"` and refreshes it in the background once it is a minute old.

Only columns with an index are sortable: id, age, country, caffeine, coffee, sleep, heart rate, and BMI. Every sort adds `id` as a tiebreaker. Without it, rows with the same age could swap places between requests and appear on two pages or on none.

`pnpm verify:pagination` checks the paging against the CSV. It follows the links the app builds for each page through every page of every sort, unfiltered, of a few dozen fixed edge cases, and of 100 random filter combinations, and fails if a matching row is shown twice, shown on no page, or shown out of order. CI runs it on every pull request with a new random seed. That finds more over time, but it also means a pull request can fail on a bug it did not add. The failure prints the seed, so `VERIFY_SEED=<seed> pnpm verify:pagination` reproduces it on any branch. [.agents/skills/verify-coffee-health-pagination/SKILL.md](.agents/skills/verify-coffee-health-pagination/SKILL.md) says what it covers and what it does not.

### Scale

I copied the dataset 200 times into a 2 million row table with the same indexes and ran each query shape the page can produce. [scripts/bench-scale.sql](scripts/bench-scale.sql) reproduces this. Separately, the `scale/million-rows` eval in [evals/exercise](evals/exercise/) grows the table to 1,000,000 rows and requests deep pages through the running app. CI fails if any response takes more than 2 seconds, and on my machine the slowest took 175 ms. The times below are single runs of `EXPLAIN ANALYZE` on Postgres 17 in Docker on a laptop, so read them as orders of magnitude.

| Query at 2 million rows                                     | Time         |
| ----------------------------------------------------------- | ------------ |
| First page, default order                                   | 0.2 ms       |
| First page sorted by an indexed column                      | 0.2 ms       |
| First page filtered by country, or by stress and sleep      | 0.1 ms       |
| First page with a rare filter and a sort (2% of rows match) | 21 ms        |
| First page when no row matches, sorted                      | 72 ms        |
| Exact count, no filter                                      | 50 ms        |
| Exact count with filters                                    | 40 to 200 ms |
| Page 20,001 (offset 1,000,000), default order               | 140 ms       |
| Page 20,001, sorted by BMI                                  | 1,100 ms     |
| Distinct countries, by loose index scan                     | 0.5 ms       |
| Same list with `select distinct`                            | 115 ms       |
| Top 50 by a column with no index                            | 95 ms        |

What holds up:

- **Reading a page.** Each sortable column has a `(column, id)` index. Postgres reads the first 50 entries from the index and stops, so the time does not grow with the table.
- **The country list.** `select distinct country` reads every row. The summary function instead jumps from one country to the next through the index, which costs one index probe per country at any table size. The same function also runs the unfiltered `count(*)`, about 50 ms at 2 million rows, which is why its result is cached.
- **Page weight.** A page is about 210 KB of HTML, under 40 KB gzipped, at any table size. My first version was 650 KB because every cell was a client component with a long class list. Cells are now plain server-rendered `<td>` elements styled by a few CSS rules, which is why the table does not use `components/ui/table`.

What does not hold up, and what I would change:

- **The exact count** reads every matching row, so it grows with the table: about 50 ms at 2 million rows and roughly ten times that at 20 million. PostgREST can return the planner's estimate above a threshold (`count: "estimated"`), which is a one-line change in `getPage`. The cost is that the pager would say "about 1.2 million" and could no longer show an exact last page.
- **Deep pages.** `offset` makes Postgres walk past every skipped row. Page 20,001 takes over a second on a non-default sort. Keyset pagination ("rows after this id") fixes that and costs the ability to jump to an arbitrary page number. I kept numbered pages because, at this size, jumping around is more useful than the milliseconds, and nobody reads to page 20,001 without filtering first.
- **Index size.** Eight indexes take 456 MB next to 211 MB of table at 2 million rows. That is the price of making eight columns sortable. A table with heavy writes would keep fewer.
- **Low-cardinality filters have no index.** Gender has three values, so an index on it would not narrow the search enough for Postgres to use it. A filter that matches almost nothing, combined with a sort, makes Postgres walk the sort index until it finds 50 matches: 72 ms at 2 million rows in the worst case, and it grows linearly. If one such combination became common, it would get its own composite or partial index.
- **Unindexed columns are not sortable** for the same reason: 95 ms at 2 million rows, growing with the table.

Supabase gives the `anon` role a 3 second statement timeout, which bounds the worst case.

### Interface

- English at `/` and Spanish at `/es`, each with its own root layout so `<html lang>` is right in the static HTML. The language links keep the current filters. Values stored in English (Good, Germany) are translated for display only.
- Coffee and sleep sit side by side with bars that grow away from the line between them: amber to the left for cups, blue to the right for hours. Bars are scaled to the dataset's maximum, so they compare across pages.
- Light and dark themes, usable at phone width, keyboard operable. I tested in Chromium on Linux only, at desktop and emulated phone sizes, and not with a screen reader. Filter menus, inputs, and labels come from `components/ui`. The min and max panels use the browser's native `popover` attribute, which avoided adding a dependency.

### Left out

- Counts next to each filter option ("Brazil, 456"). Each one is a `group by` over the filtered rows, which is the same cost as the exact count again per filter.
- Free-text search. No column needs it.
- A test suite against a running database. The unit tests cover URL parsing and page-number logic. CI loads the CSV into a fresh Supabase, builds the app, and checks that the page sorted by caffeine shows the largest value in the CSV. Beyond that, I checked the queries by comparing counts in the running app with counts computed from the CSV in Python.
- A styled 404 page. An unknown path gets the Next.js default.

---

## Configuración (Español)

### Requisitos del sistema

Instala lo siguiente antes de trabajar en este repositorio:

| Requisito                         | Versión                | Instalación                                                       |
| --------------------------------- | ---------------------- | ----------------------------------------------------------------- |
| [Node.js](https://nodejs.org/)    | 24 o superior          | [nodejs.org/en/download](https://nodejs.org/en/download)          |
| [Docker](https://www.docker.com/) | Última versión estable | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |
| [pnpm](https://pnpm.io/)          | 10 o superior          | [pnpm.io/installation](https://pnpm.io/installation)              |

Docker debe estar en ejecución antes de iniciar el servidor de desarrollo. Supabase se ejecuta localmente en contenedores Docker.

Verifica tus versiones:

```bash
node --version   # v24.x o superior
docker --version
pnpm --version   # 10.x o superior
```

### Instalación

1. Clona el repositorio y entra al directorio del proyecto:

   ```bash
   git clone <url-del-repositorio>
   cd take-home
   ```

2. Instala las dependencias:

   ```bash
   pnpm install
   ```

3. Configura las variables de entorno ejecutando el script de configuración:

   ```bash
   pnpm setup:env
   ```

   Esto inicia Supabase localmente, lee las credenciales de `supabase status -o env`, las escribe en `.env.local` y carga `data/synthetic_coffee_health_10000.csv` en la tabla `coffee_health` si la tabla está vacía:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SECRET_KEY=
   ```

   `.env.local` está en `.gitignore` y es el archivo que Next.js carga en desarrollo. No subas secretos al repositorio.

   Para configurar manualmente, inicia Supabase con `pnpm dev:supabase`, copia `.env.example` a `.env.local`, completa los valores tú mismo y después ejecuta `pnpm db:load` para cargar el CSV.

Atajo: `pnpm bootstrap` ejecuta los pasos 2 y 3 de una vez. Comprueba Node.js y pnpm, instala las dependencias y luego comprueba que Docker esté en ejecución antes de iniciar Supabase, escribir `.env.local` y cargar el CSV si la tabla está vacía. Puedes volver a ejecutarlo sin problema.

### Ejecutar la aplicación

Inicia Supabase y el servidor de desarrollo de Next.js juntos:

```bash
pnpm dev
```

Esto ejecuta `supabase start` y `next dev` en paralelo. Abre [http://localhost:3000](http://localhost:3000) cuando ambos servicios estén listos.

Para ejecutar los servicios por separado:

```bash
pnpm dev:supabase   # Iniciar Supabase local (Docker)
pnpm dev:next       # Iniciar solo Next.js
```

### Otros comandos

```bash
pnpm bootstrap   # Comprobar requisitos, instalar, iniciar Supabase, escribir .env.local y cargar el CSV
pnpm setup:env   # Iniciar Supabase, escribir .env.local y cargar el CSV si la tabla está vacía
pnpm db:reset    # Recrear la base de datos local desde las migraciones y seed.sql, y cargar el CSV
pnpm db:load     # Recargar el CSV en coffee_health
pnpm check       # Verificación de formato, lint, typecheck y pruebas unitarias
pnpm build       # Compilación de producción
pnpm start       # Servidor de producción
pnpm lint        # Ejecutar ESLint
pnpm format      # Formatear archivos con Oxfmt
pnpm test        # Ejecutar pruebas en modo watch
pnpm test:run    # Ejecutar pruebas una vez
```

### Trabajar en T3 Code

[`t3.json`](t3.json) declara las acciones de este repositorio para [T3 Code](https://t3.codes). Impórtalas una vez por máquina: abre **Settings → Projects**, elige este proyecto y en la sección Actions usa **Import scripts** una vez por cada acción. También puedes importarlas desde el menú de acciones de un hilo, en **From t3.json**. Importar las copia a tu configuración de T3 Code y omite cualquier acción cuyo nombre o comando ya tengas, así que cuando cambie una acción en `t3.json`, edítala en la configuración de T3 Code, o bórrala e impórtala de nuevo.

| Acción | Comando                                                       | Qué hace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup  | `pnpm run --if-present bootstrap --continue-without-supabase` | Se ejecuta cuando T3 Code crea un worktree. El agente espera a que termine, así que empieza con las dependencias instaladas, Supabase en ejecución y `.env.local` escrito. Si Docker no está en ejecución o Supabase no arranca, Setup igualmente instala las dependencias y deja que el agente empiece; corrige el problema y ejecuta `pnpm setup:env`. En ramas sin `bootstrap`, Setup omite Supabase y `.env.local` y deja que el agente empiece igualmente, después de que pnpm 11+ instale las dependencias. |
| Dev    | `pnpm dev`                                                    | Inicia Supabase y Next.js. Abre la app desde la tarjeta de detalles del hilo, que lista los puertos que abrieron las terminales de este hilo. Se detiene cuando el hilo se cierra (settle).                                                                                                                                                                                                                                                                                                                       |
| Check  | `pnpm check`                                                  | Verificación de formato, lint, typecheck y pruebas unitarias, los mismos pasos que el primer job de CI.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Test   | `pnpm test`                                                   | Vitest en modo watch. Se detiene cuando el hilo se cierra (settle).                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Todos los worktrees usan el mismo stack local de Supabase, porque `project_id` y los puertos de `supabase/config.toml` son fijos. Las migraciones de un worktree llegan a la base de datos solo cuando ejecutas `pnpm db:reset` desde ese worktree, y eso reemplaza los datos que ven todos los demás worktrees; por eso no es una acción de un clic. Next.js usa el puerto 3000, o el siguiente puerto libre si el servidor de desarrollo de otro worktree ya lo ocupa, así que usa el puerto que T3 Code lista para este hilo en lugar de asumir 3000.

---

## Ejercicio (Español)

Después de completar la configuración, construye una funcionalidad que cargue el conjunto de datos de salud y café en Supabase y lo muestre en una tabla con filtros en la aplicación Next.js.

### Conjunto de datos

El archivo `data/synthetic_coffee_health_10000.csv` contiene **10,000 filas** de datos sintéticos sobre salud y consumo de café. Cada fila tiene estas columnas:

| Columna                   | Tipo           |
| ------------------------- | -------------- |
| `ID`                      | entero         |
| `Age`                     | entero         |
| `Gender`                  | texto          |
| `Country`                 | texto          |
| `Coffee_Intake`           | decimal        |
| `Caffeine_mg`             | decimal        |
| `Sleep_Hours`             | decimal        |
| `Sleep_Quality`           | texto          |
| `BMI`                     | decimal        |
| `Heart_Rate`              | entero         |
| `Stress_Level`            | texto          |
| `Physical_Activity_Hours` | decimal        |
| `Health_Issues`           | texto          |
| `Occupation`              | texto          |
| `Smoking`                 | entero (0 o 1) |
| `Alcohol_Consumption`     | entero (0 o 1) |

### Parte 1 — Cargar los datos en Supabase

1. Diseña una tabla (o tablas) en Postgres para almacenar este conjunto de datos. Añade una migración en `supabase/migrations/` y/o un archivo de esquema en `supabase/schemas/`.
2. Carga las 10,000 filas del CSV en tu base de datos local. Puedes usar cualquier enfoque razonable — por ejemplo, un script de seed, un script de carga puntual o `COPY` de Postgres.
3. Aplica los cambios localmente:

   ```bash
   pnpx supabase db reset   # ejecuta migraciones y seed.sql
   ```

   O ejecuta solo los pasos que necesites (`supabase migration up`, script de importación personalizado, etc.).

4. Verifica que el conteo de filas en la base de datos coincida con el CSV (10,000 filas).

El proyecto inicial incluye una tabla de ejemplo `notes` y helpers de cliente Supabase en `lib/supabase/`. Puedes conservarlos, reemplazarlos o extenderlos según prefieras.

### Parte 2 — Mostrar una tabla con filtros en Next.js

Construye una página en la aplicación Next.js que muestre los datos cargados en una tabla y permita filtrarlos.

Como mínimo, implementa filtros sobre algunas columnas relevantes — por ejemplo, país, género, calidad del sueño, nivel de estrés o rangos numéricos (edad, consumo de café, IMC). Tú decides qué filtros son más útiles y cómo deben comportarse (coincidencia exacta, selección múltiple, mínimo/máximo, etc.).

Hay componentes de UI disponibles en `components/ui/` (incluidos `table`, `input`, `button` y otros). Úsalos o reemplázalos por los tuyos.

### Parte 3 — Piensa en la escala

10,000 filas es poco para Postgres, pero suficiente para exponer patrones ingenuos en la UI y en las consultas. **Diseña pensando en la escala** — asume que el conjunto de datos podría crecer a cientos de miles o millones de filas.

Documenta cualquier compromiso o supuesto en tu entrega. Nos interesa cómo razonas sobre el rendimiento, no una biblioteca concreta.

### Uso de IA

El desarrollo asistido por IA es bienvenido. Puedes usar asistentes de código, chatbots u otras herramientas de IA mientras trabajas en este ejercicio.

Durante la revisión, asumiremos que entiendes tu entrega y que puedes explicar tu enfoque — por qué tomaste ciertas decisiones, cómo funciona la solución y qué compromisos consideraste. Usa la IA como te ayude, pero asegúrate de que podrías repasar el código con nosotros sin depender de ella.

### Qué entregar

- Configuración local funcional: datos cargados, tabla visible en [http://localhost:3000](http://localhost:3000) (o en una ruta que añadas).
- Notas breves sobre tu esquema, enfoque de importación, estrategia de filtrado y decisiones de escala.

---

## Notas de entrega (Español)

### Cómo ejecutarlo

Los pasos de configuración de arriba son todo lo necesario. `pnpm setup:env` inicia Supabase, que aplica las migraciones, y después carga el CSV si la tabla está vacía. Tras `pnpm dev`, la tabla está en [http://localhost:3000](http://localhost:3000) en inglés y en [http://localhost:3000/es](http://localhost:3000/es) en español.

El `pnpx supabase db reset` del ejercicio por sí solo recrea la tabla y la deja vacía, porque no puede leer el CSV. `pnpm db:reset` ejecuta `supabase db reset` con la CLI fijada en el proyecto y después corre el cargador. Si la tabla falta o está vacía, la página lo dice y muestra ese comando.

### Esquema

Una tabla, `public.coffee_health`, con una fila por persona encuestada y las 16 columnas del CSV en snake_case. Está definida en [supabase/schemas/coffee_health.sql](supabase/schemas/coffee_health.sql). La migración en `supabase/migrations/` salió de `supabase db diff`, más un final escrito a mano con el comentario de la tabla y los privilegios, que la herramienta de diff no genera.

| Columna                                                                         | Tipo                      | Por qué                                                                                                                                                                               |
| ------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                            | `integer`, clave primaria | El CSV ya trae un id único.                                                                                                                                                           |
| `age`, `heart_rate`                                                             | `smallint`                | Dos bytes alcanzan.                                                                                                                                                                   |
| `coffee_intake`, `caffeine_mg`, `sleep_hours`, `bmi`, `physical_activity_hours` | `numeric` con un decimal  | El CSV tiene un decimal. `numeric` guarda 5.3 como 5.3, algo que `real` no garantiza.                                                                                                 |
| `gender`, `occupation`, `sleep_quality`, `stress_level`, `health_issues`        | enums de Postgres         | Conjuntos cerrados de respuestas. Un enum ocupa cuatro bytes, rechaza un valor mal escrito al cargar y ordena según su declaración, así que Poor va antes que Fair, Good y Excellent. |
| `country`                                                                       | `text`                    | Conjunto abierto. Un país nuevo debe cargarse sin una migración.                                                                                                                      |
| `smoking`, `alcohol_consumption`                                                | `boolean`                 | Los 0 y 1 del CSV.                                                                                                                                                                    |

Todas las columnas son `not null` y las numéricas tienen restricciones de rango, así que una fila inválida detiene la carga.

Mantuve una sola tabla ancha y no separé países ni ocupaciones en tablas de catálogo. Las filas son angostas, unos 110 bytes cada una, y un join en cada petición de página costaría más que los bytes que ahorra.

Row level security está activado, con una política de `select`. Los roles `anon` y `authenticated` pueden hacer `select` y nada más. Comprobé que un insert por la API con la clave publicable devuelve 401.

### Importación

[scripts/load-coffee-health.sh](scripts/load-coffee-health.sh) (`pnpm db:load`) envía el CSV a Postgres con `COPY`, usando `psql` dentro del contenedor de base de datos de Supabase, así que no requiere instalar nada aparte de Docker.

- Primero compara el encabezado del CSV con la lista de columnas esperada. `COPY` asigna las columnas por posición, así que un archivo reordenado se cargaría en las columnas equivocadas sin dar error.
- `truncate`, `copy` y una comprobación del número de filas corren en una sola transacción. Si la copia falla, o el conteo de la tabla no coincide con el del archivo, la transacción se revierte y las filas anteriores se conservan. Ejecutar el script dos veces da el mismo resultado.
- Después ejecuta `analyze`.

La carga tarda unos 0,3 segundos para 10.000 filas. Para comprobarla, exporté la tabla de vuelta a CSV y la comparé con el archivo original usando `diff`. Son idénticos. La CI ejecuta el mismo cargador contra una base de datos nueva en cada pull request.

No usé `seed.sql`. El contenedor de la base de datos no monta el repositorio, así que un archivo de seed no puede hacer `COPY` desde el CSV. El seed tendría que ser 10.000 filas `insert` generadas y guardadas junto al CSV que duplican. `COPY` desde el cliente es además el método que sigue funcionando con millones de filas.

### Filtros

La URL guarda todo el estado, por ejemplo `/es?country=Brazil,Germany&age=30..50&smoking=yes&sort=-caffeine_mg&page=2`. Una vista es un enlace que se puede compartir, el botón Atrás deshace un filtro y el servidor renderiza la página sin peticiones de datos desde el cliente. El análisis de la URL vive en [lib/coffee-health/search-params.ts](lib/coffee-health/search-params.ts) y tiene pruebas unitarias. Descarta todo lo que no entiende.

| Filtro                             | Columnas                                                               | Comportamiento                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Elegir cualquier número de valores | país, género, ocupación, calidad del sueño, estrés, problemas de salud | Filas que coinciden con cualquiera de los valores marcados (`in`).                                                                                               |
| Mínimo y máximo                    | edad, café, sueño, IMC                                                 | Inclusivo. Cualquiera de los dos lados puede quedar vacío. Se aplica con el botón Aplicar o con Enter, para que un número a medio escribir no recargue la tabla. |
| Sí o no                            | fuma, bebe alcohol                                                     | Coincidencia exacta.                                                                                                                                             |

Los filtros se combinan con `and`. Cambiar un filtro vuelve a la página 1.

Postgres filtra, ordena, pagina y cuenta en una sola petición a PostgREST que se arma en [lib/coffee-health/queries.ts](lib/coffee-health/queries.ts).

- **Método de paginación.** Páginas numeradas de 50 filas con `limit` y `offset`. El navegador nunca recibe más de una página, sin importar el tamaño de la tabla. El límite de 1.000 filas por respuesta de la API (`max_rows`) queda intacto y nunca se alcanza.
- **Método de conteo.** El conteo exacto de PostgREST (`count: "exact"`), que ejecuta `count(*)` sobre las filas filtradas en la misma petición. El paginador lo necesita para mostrar el número de la última página.

Las dos decisiones son las simples, y las dos tienen un costo a escala que la siguiente sección mide.

La lista de países, el total de filas y el mínimo y máximo de cada rango salen de una función SQL, `coffee_health_summary()`. Su resultado no depende de los filtros, así que Next.js lo guarda en caché con `"use cache"` y lo actualiza en segundo plano cuando tiene más de un minuto.

Solo se puede ordenar por columnas con índice: id, edad, país, cafeína, café, sueño, pulso e IMC. Cada orden agrega `id` como desempate. Sin él, las filas con la misma edad podrían cambiar de lugar entre peticiones y salir en dos páginas o en ninguna.

`pnpm verify:pagination` comprueba la paginación contra el CSV. Sigue los enlaces que la app arma para cada página por todas las páginas de cada orden, sin filtros, de unas decenas de casos límite fijos y de 100 combinaciones de filtros al azar, y falla si una fila que coincide sale dos veces, no sale en ninguna página o sale fuera de orden. CI lo ejecuta en cada pull request con una semilla al azar distinta. Así encuentra más con el tiempo, pero un pull request puede fallar por un error que no introdujo. El fallo imprime la semilla, así que `VERIFY_SEED=<semilla> pnpm verify:pagination` lo reproduce en cualquier rama. [.agents/skills/verify-coffee-health-pagination/SKILL.md](.agents/skills/verify-coffee-health-pagination/SKILL.md) explica qué cubre y qué no.

### Escala

Copié el conjunto de datos 200 veces en una tabla de 2 millones de filas con los mismos índices y ejecuté cada forma de consulta que la página puede producir. [scripts/bench-scale.sql](scripts/bench-scale.sql) lo reproduce. Aparte, el eval `scale/million-rows` de [evals/exercise](evals/exercise/) hace crecer la tabla a 1.000.000 de filas y pide páginas profundas a la aplicación en ejecución. La CI falla si alguna respuesta tarda más de 2 segundos, y en mi máquina la más lenta tardó 175 ms. Los tiempos de abajo son ejecuciones únicas de `EXPLAIN ANALYZE` en Postgres 17 dentro de Docker en un portátil, así que sirven como órdenes de magnitud.

| Consulta con 2 millones de filas                                                     | Tiempo      |
| ------------------------------------------------------------------------------------ | ----------- |
| Primera página, orden por defecto                                                    | 0,2 ms      |
| Primera página ordenada por una columna con índice                                   | 0,2 ms      |
| Primera página filtrada por país, o por estrés y sueño                               | 0,1 ms      |
| Primera página con un filtro poco frecuente y un orden (coincide el 2% de las filas) | 21 ms       |
| Primera página cuando ninguna fila coincide, con orden                               | 72 ms       |
| Conteo exacto, sin filtros                                                           | 50 ms       |
| Conteo exacto con filtros                                                            | 40 a 200 ms |
| Página 20.001 (offset 1.000.000), orden por defecto                                  | 140 ms      |
| Página 20.001, ordenada por IMC                                                      | 1.100 ms    |
| Países distintos, con loose index scan                                               | 0,5 ms      |
| La misma lista con `select distinct`                                                 | 115 ms      |
| Primeras 50 filas por una columna sin índice                                         | 95 ms       |

Lo que aguanta:

- **Leer una página.** Cada columna ordenable tiene un índice `(columna, id)`. Postgres lee las primeras 50 entradas del índice y se detiene, así que el tiempo no crece con la tabla.
- **La lista de países.** `select distinct country` lee todas las filas. La función de resumen salta de un país al siguiente por el índice, lo que cuesta una búsqueda en el índice por país con cualquier tamaño de tabla. La misma función también ejecuta el `count(*)` sin filtros, unos 50 ms con 2 millones de filas, y por eso su resultado se guarda en caché.
- **El peso de la página.** Una página pesa unos 210 KB de HTML, menos de 40 KB con gzip, con cualquier tamaño de tabla. Mi primera versión pesaba 650 KB porque cada celda era un componente de cliente con una lista larga de clases. Ahora las celdas son elementos `<td>` simples renderizados en el servidor, con estilos de unas pocas reglas CSS, y por eso la tabla no usa `components/ui/table`.

Lo que no aguanta, y qué cambiaría:

- **El conteo exacto** lee todas las filas que coinciden, así que crece con la tabla: unos 50 ms con 2 millones de filas y cerca de diez veces más con 20 millones. PostgREST puede devolver la estimación del planificador por encima de un umbral (`count: "estimated"`), un cambio de una línea en `getPage`. El costo es que el paginador diría "cerca de 1,2 millones" y ya no podría mostrar una última página exacta.
- **Las páginas profundas.** `offset` obliga a Postgres a recorrer cada fila que se salta. La página 20.001 tarda más de un segundo con un orden distinto al de por defecto. La paginación por cursor ("filas después de este id") lo resuelve y cuesta la posibilidad de saltar a un número de página cualquiera. Mantuve las páginas numeradas porque, con este tamaño, saltar entre páginas es más útil que esos milisegundos, y nadie llega a la página 20.001 sin filtrar antes.
- **El tamaño de los índices.** Ocho índices ocupan 456 MB junto a 211 MB de tabla con 2 millones de filas. Es el precio de poder ordenar por ocho columnas. Una tabla con muchas escrituras tendría menos.
- **Los filtros de baja cardinalidad no tienen índice.** Género tiene tres valores, así que un índice sobre esa columna no reduciría la búsqueda lo suficiente para que Postgres lo use. Un filtro que casi no coincide con nada, combinado con un orden, hace que Postgres recorra el índice del orden hasta encontrar 50 coincidencias: 72 ms con 2 millones de filas en el peor caso, y crece de forma lineal. Si una combinación así se volviera frecuente, tendría su propio índice compuesto o parcial.
- **No se puede ordenar por columnas sin índice** por la misma razón: 95 ms con 2 millones de filas, y crece con la tabla.

Supabase le da al rol `anon` un tiempo máximo de 3 segundos por consulta, lo que acota el peor caso.

### Interfaz

- Inglés en `/` y español en `/es`, cada uno con su propio layout raíz para que `<html lang>` sea correcto en el HTML estático. Los enlaces de idioma conservan los filtros actuales. Los valores guardados en inglés (Good, Germany) se traducen solo al mostrarlos.
- Café y sueño van lado a lado con barras que crecen alejándose de la línea que los separa: ámbar hacia la izquierda para las tazas, azul hacia la derecha para las horas. Las barras usan como escala el máximo del conjunto de datos, así que se pueden comparar entre páginas.
- Temas claro y oscuro, usable en el ancho de un teléfono y operable con teclado. Probé solo en Chromium sobre Linux, en tamaños de escritorio y de teléfono emulado, y sin lector de pantalla. Los menús de filtros, los campos y las etiquetas vienen de `components/ui`. Los paneles de mínimo y máximo usan el atributo nativo `popover` del navegador, lo que evitó agregar una dependencia.

### Lo que quedó fuera

- Conteos junto a cada opción de filtro ("Brasil, 456"). Cada uno es un `group by` sobre las filas filtradas, el mismo costo del conteo exacto otra vez por cada filtro.
- Búsqueda de texto libre. Ninguna columna la necesita.
- Una suite de pruebas contra una base de datos en ejecución. Las pruebas unitarias cubren el análisis de la URL y la lógica de los números de página. La CI carga el CSV en un Supabase nuevo, compila la aplicación y comprueba que la página ordenada por cafeína muestra el valor más alto del CSV. Además, verifiqué las consultas comparando los conteos de la aplicación en ejecución con conteos calculados desde el CSV en Python.
- Una página 404 con estilos. Una ruta desconocida recibe la página por defecto de Next.js.
