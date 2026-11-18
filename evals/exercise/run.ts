import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import {
  HEADERS,
  ID_HEADER,
  NO_ROWS_TEXT,
  ROUTE,
  TABLE,
  columnFor,
  urlFor,
} from "./app.ts";
import { CASES, type Case } from "./cases.ts";
import {
  baselineHolds,
  compareCells,
  compareRows,
  diffBaseline,
  expectedOnPage,
  judgePage,
  nextBaseline,
  pagesToCheck,
  parseBaseline,
  type Baseline,
  type Result,
} from "./grade.ts";
import {
  expectedIds,
  expectedIdsScaled,
  parseCsv,
  type CsvRow,
  type Filter,
} from "./oracle.ts";
import { readPage } from "./page.ts";

const root = new URL("../../", import.meta.url).pathname;

const { values: args } = parseArgs({
  options: {
    out: { type: "string" },
    "base-url": { type: "string", default: "http://localhost:3000" },
    case: { type: "string", multiple: true },
    scale: { type: "boolean", default: false },
    baseline: { type: "string" },
    "write-baseline": { type: "string" },
    "accept-regressions": { type: "boolean", default: false },
  },
});

if (!args.out) {
  console.error(
    "Usage: pnpm evals:exercise --out <dir> [--base-url <url>] [--case <id>]... [--scale] [--baseline <file>] [--write-baseline <file> [--accept-regressions]]",
  );
  process.exit(2);
}
const baseUrl = args["base-url"].replace(/\/$/, "");

/** A missing file is an empty baseline only when `missingOk`. */
const readBaseline = (path: string, missingOk: boolean): Baseline => {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (missingOk && (error as { code?: string }).code === "ENOENT") return {};
    console.error(
      `Cannot read the baseline ${path}: ${(error as Error).message}`,
    );
    process.exit(2);
  }
  const parsed = parseBaseline(text);
  if (typeof parsed === "string") {
    console.error(`The baseline ${path} ${parsed}`);
    process.exit(2);
  }
  return parsed;
};

// Read before running, so a wrong path fails fast.
const baseline = args.baseline ? readBaseline(args.baseline, false) : undefined;
const previousBaseline = args["write-baseline"]
  ? readBaseline(args["write-baseline"], true)
  : undefined;

// Database access goes through psql inside the Supabase database container,
// so the only thing a machine needs is the Docker it already runs Supabase on.

function dbContainer(): string {
  if (process.env.EVALS_DB_CONTAINER) return process.env.EVALS_DB_CONTAINER;
  const config = readFileSync(join(root, "supabase/config.toml"), "utf8");
  const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
  if (!projectId) throw new Error("No project_id in supabase/config.toml");
  return `supabase_db_${projectId}`;
}
const container = dbContainer();

function sql(...statements: string[]): string {
  const commands = statements.flatMap((statement) => ["-c", statement]);
  try {
    return execFileSync(
      "docker",
      [
        "exec",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        ...commands,
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: "pipe" },
    ).trim();
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(stderr || String(error));
  }
}

const rowCount = () => Number(sql(`select count(*) from ${TABLE}`));

const checksum = () =>
  sql(
    `select count(*) || ':' || coalesce(md5(string_agg(t::text, ',' order by t.${columnFor("ID")})), '') from ${TABLE} t`,
  );

type Fetched = { status: number; html: string; ms: number };

const TIMEOUT_MS = 30_000;

/** `started` carries over to a retry, so its time counts the failed attempt. */
async function get(
  path: string,
  retry = true,
  started = performance.now(),
): Promise<Fetched> {
  try {
    const response = await fetch(baseUrl + path, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = await response.text();
    return { status: response.status, html, ms: performance.now() - started };
  } catch (error) {
    if ((error as Error).name === "TimeoutError") {
      throw new Error(`GET ${path} took longer than ${TIMEOUT_MS / 1000} s`);
    }
    // The server closes idle keep-alive connections after a few seconds, and
    // fetch can pick one up just as it closes. That is the connection, not
    // the app, so one retry. HTTP errors are never retried.
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (retry && (code === "ECONNRESET" || code === "UND_ERR_SOCKET")) {
      return get(path, false, started);
    }
    const cause = (error as { cause?: { code?: string; message?: string } })
      .cause;
    throw new Error(
      `GET ${baseUrl}${path} failed: ${cause?.code ?? cause?.message ?? (error as Error).message}`,
    );
  }
}

/** Rows shown on the unfiltered first page, or the reason it has none. */
async function detectPageSize(): Promise<number | string> {
  try {
    const page = await get(ROUTE);
    if (page.status !== 200) return `GET ${ROUTE} answered ${page.status}`;
    const { table } = readPage(page.html, ID_HEADER);
    if (!table) return `GET ${ROUTE} has no table with an ${ID_HEADER} column`;
    if (table.ids.length === 0)
      return `GET ${ROUTE} shows a table with no rows`;
    return table.ids.length;
  } catch (error) {
    return `GET ${baseUrl}${ROUTE} failed: ${(error as Error).message}`;
  }
}

/**
 * Requests each page and judges it. `problem` is null when every page shows
 * what it should. `slowestMs` is the slowest response, reading the page
 * excluded.
 *
 * `pastEnd` is how strict to be on the page right after the last one. The
 * filter cases only use it to catch rows past the end, so an empty table is enough
 * there ("enough"). The input cases check its wording ("needs-message").
 */
async function checkPages(
  filter: Filter,
  expected: number[],
  pageSize: number,
  pages = pagesToCheck(expected.length, pageSize),
  pastEnd: "enough" | "needs-message" = "enough",
): Promise<{ problem: string | null; slowestMs: number }> {
  let slowestMs = 0;
  const last = Math.ceil(expected.length / pageSize);
  for (const page of pages) {
    const url = urlFor(filter, page);
    const response = await get(url);
    slowestMs = Math.max(slowestMs, response.ms);
    if (response.status !== 200) {
      return { problem: `${url} answered ${response.status}`, slowestMs };
    }
    const problem = judgePage(
      readPage(response.html, ID_HEADER),
      expectedOnPage(expected, page, pageSize),
      NO_ROWS_TEXT,
      last > 0 && page === last + 1 ? pastEnd : "needs-message",
    );
    if (problem) return { problem: `${url}: ${problem}`, slowestMs };
  }
  return { problem: null, slowestMs };
}

type Check = { pass: boolean; detail: string };

async function runCase(
  c: Case,
  csv: CsvRow[],
  pageSize: number | string,
): Promise<Check> {
  const needPage = () => {
    if (typeof pageSize === "string") throw new Error(pageSize);
    return pageSize;
  };

  switch (c.kind) {
    case "row-count": {
      const count = rowCount();
      return {
        pass: count === csv.length,
        detail: `${TABLE} has ${count} rows, the CSV has ${csv.length}`,
      };
    }

    case "round-trip": {
      const stored = sql(
        `select row_to_json(t) from ${TABLE} t order by t.${columnFor("ID")}`,
      )
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const problems = compareRows(csv, stored, columnFor);
      return problems.length === 0
        ? { pass: true, detail: `all ${csv.length} rows match` }
        : { pass: false, detail: problems.join("; ") };
    }

    case "page": {
      const size = needPage();
      const expected = expectedIds(csv, c.filter);
      const { problem } = await checkPages(c.filter, expected, size);
      const pages = pagesToCheck(expected.length, size);
      return problem
        ? { pass: false, detail: problem }
        : {
            pass: true,
            detail: `${expected.length} matching rows; pages ${pages.join(", ")} exact`,
          };
    }

    case "input": {
      const size = needPage();
      const expected = expectedIds(csv, c.filter);
      const page =
        c.page === "after-last"
          ? Math.ceil(expected.length / size) + 1
          : c.page;
      const url = urlFor(c.filter, page);
      const before = checksum();
      const { problem } = await checkPages(
        c.filter,
        expected,
        size,
        [page],
        "needs-message",
      );
      if (problem) return { pass: false, detail: problem };
      if (checksum() !== before)
        return { pass: false, detail: `${url} changed the data` };
      return {
        pass: true,
        detail: `${url} shows the expected rows; data unchanged`,
      };
    }

    case "values": {
      const response = await get(ROUTE);
      const { table } = readPage(response.html, ID_HEADER);
      if (!table || table.ids.length === 0) {
        return { pass: false, detail: `${ROUTE} shows no data table` };
      }
      const missing = c.columns.filter((column) => !HEADERS[column]);
      if (missing.length > 0) {
        throw new Error(
          `app.ts HEADERS has no header for ${missing.join(", ")}`,
        );
      }
      const problem = compareCells(
        table,
        csvById,
        Object.fromEntries(
          c.columns.map((column) => [column, HEADERS[column]]),
        ),
      );
      return problem
        ? { pass: false, detail: problem }
        : {
            pass: true,
            detail: `${table.ids.length} rows show their ${c.columns.join(", ")} in the right columns`,
          };
    }

    case "weight": {
      const response = await get(ROUTE);
      const { table } = readPage(response.html, ID_HEADER);
      const bytes = Buffer.byteLength(response.html);
      const rows = table?.ids.length ?? 0;
      const detail = `${ROUTE} sent ${rows} rows in ${Math.round(bytes / 1024)} KB`;
      if (!table || rows === 0) {
        return { pass: false, detail: `${ROUTE} shows no data table` };
      }
      return {
        pass: rows <= c.maxRows && bytes <= c.maxBytes,
        detail: `${detail} (limits: ${c.maxRows} rows, ${Math.round(c.maxBytes / 1024)} KB)`,
      };
    }

    case "scale":
      return runScale(c, csv, needPage());
  }
}

async function runScale(
  c: Extract<Case, { kind: "scale" }>,
  csv: CsvRow[],
  pageSize: number,
): Promise<Check> {
  const before = rowCount();
  if (before !== csv.length) {
    return {
      pass: false,
      detail:
        before > csv.length
          ? `found ${before} rows, expected ${csv.length}. If an earlier --scale run was stopped, remove its copies: delete from ${TABLE} where ${columnFor("ID")} > ${csv.length}`
          : `needs the ${csv.length} CSV rows loaded first, found ${before}`,
    };
  }
  // Cleanup deletes every ID above the CSV's, so first make sure the table
  // holds exactly the CSV's IDs. Otherwise touch nothing.
  const originals = Number(
    sql(
      `select count(distinct ${columnFor("ID")}) from ${TABLE} where ${columnFor("ID")} between 1 and ${csv.length}`,
    ),
  );
  if (originals !== csv.length) {
    return {
      pass: false,
      detail: `the table's IDs are not exactly 1 to ${csv.length}, so the scale copy would not be safe to remove; nothing changed`,
    };
  }
  const [schema, table] = TABLE.split(".");
  const id = columnFor("ID");
  // Generated columns fill themselves in, so they are left out.
  const columns = sql(
    `select column_name from information_schema.columns where table_schema = '${schema}' and table_name = '${table}' and is_generated = 'NEVER' order by ordinal_position`,
  ).split("\n");
  const select = columns
    .map((column) => (column === id ? `${id} + k * ${csv.length}` : column))
    .join(", ");

  // Ctrl-C in a terminal also stops the docker exec running the copy, but
  // not the query inside the container, which would commit later. So the
  // copy carries a marker, and cleanup cancels it and waits for it to end
  // before deleting.
  const marker = "/* evals:scale-copy */";
  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  const removeCopies = async () => {
    const marked = `from pg_stat_activity where pid <> pg_backend_pid() and query like '${marker}%'`;
    // Wait until no marked query is seen twice in a row, 200 ms apart: a
    // Ctrl-C right at the start can land before psql has sent the copy.
    let quiet = 0;
    for (let i = 0; quiet < 2 && i < 50; i++) {
      if (sql(`select count(*) ${marked}`) === "0") quiet++;
      else {
        quiet = 0;
        sql(`select pg_cancel_backend(pid) ${marked}`);
      }
      await sleep(200);
    }
    sql(
      `delete from ${TABLE} where ${id} > ${csv.length}`,
      `vacuum analyze ${TABLE}`,
    );
    // The copy could still commit after this delete.
    if (quiet < 2) throw new Error("the scale copy would not stop");
  };
  // A Ctrl-C and the normal end of the case share one cleanup, so whichever
  // comes second waits for it instead of moving on before the delete.
  let removing: Promise<void> | undefined;
  const removeOnce = () => (removing ??= removeCopies());
  let stopped = false;
  const stop = async () => {
    if (!stopped) console.error("\nStopped. Removing the scale copies first.");
    stopped = true;
    try {
      await removeOnce();
      console.error("The scale copies are removed.");
    } catch (error) {
      console.error(
        `Could not remove the scale copies: ${(error as Error).message}\nRemove them with: delete from ${TABLE} where ${id} > ${csv.length}`,
      );
    } finally {
      process.exit(130);
    }
  };
  const onSignal = () => void stop();
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    const grew = performance.now();
    sql(
      `${marker} insert into ${TABLE} (${columns.join(", ")}) overriding system value select ${select} from ${TABLE}, generate_series(1, ${c.copies - 1}) as k where ${id} <= ${csv.length}`,
      `analyze ${TABLE}`,
    );
    const growSeconds = ((performance.now() - grew) / 1000).toFixed(1);

    const total = rowCount();
    if (total !== csv.length * c.copies) {
      return {
        pass: false,
        detail: `grew to ${total} rows, expected ${csv.length * c.copies}: the copy did not finish (stopped with Ctrl-C, or the insert failed)`,
      };
    }

    const timings: string[] = [];
    let slowest = 0;
    // The middle page of each filter's result. It lands in the copied rows,
    // so no page cached before the table grew can answer it, and it makes
    // the database skip half the matches.
    const checks = c.filters.map((filter) => ({
      filter,
      page: Math.max(
        1,
        Math.ceil(
          expectedIdsScaled(csv, filter, c.copies).length / pageSize / 2,
        ),
      ),
    }));
    for (const { filter, page } of checks) {
      const expected = expectedIdsScaled(csv, filter, c.copies);
      // Three requests: a cache can make the second one fast, but the first
      // is what a person changing a filter waits for. Only the response is
      // timed, not the evals reading the page.
      const times: number[] = [];
      for (let i = 0; i < 3; i++) {
        const { problem, slowestMs } = await checkPages(
          filter,
          expected,
          pageSize,
          [page],
        );
        times.push(slowestMs);
        if (problem)
          return { pass: false, detail: `at ${total} rows, ${problem}` };
      }
      const worst = Math.max(...times);
      slowest = Math.max(slowest, worst);
      timings.push(
        `${urlFor(filter, page)} ${times.map((t) => Math.round(t)).join("/")} ms`,
      );
    }
    return {
      pass: slowest <= c.maxMs,
      detail: `${total} rows (grown in ${growSeconds} s); slowest ${Math.round(slowest)} ms, limit ${c.maxMs} ms; ${timings.join("; ")}`,
    };
  } finally {
    // The handlers stay on until the copies are gone. A Ctrl-C that came
    // during the blocking copy reaches its handler during this cleanup's
    // waits, and the run then exits instead of carrying on.
    try {
      await removeOnce();
      await sleep(20);
    } finally {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    }
    if (stopped) process.exit(130);
  }
}

const csv = parseCsv(
  readFileSync(join(root, "data/synthetic_coffee_health_10000.csv"), "utf8"),
);
const csvById = new Map(csv.map((row) => [Number(row.ID), row]));
const selected = args.case
  ? CASES.filter((c) => args.case!.includes(c.id))
  : CASES;
const unknownCases = (args.case ?? []).filter(
  (id) => !CASES.some((c) => c.id === id),
);
if (unknownCases.length > 0) {
  console.error(`Unknown case: ${unknownCases.join(", ")}`);
  process.exit(2);
}

// A run that cannot reach the database or the server says so and stops,
// instead of reporting every case as a failure of the app.
try {
  sql("select 1");
} catch (error) {
  console.error(
    `Cannot run SQL in the database container ${container}. Is Supabase running? Set EVALS_DB_CONTAINER if the container has another name.\n${(error as Error).message}`,
  );
  process.exit(2);
}
try {
  await fetch(baseUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
} catch (error) {
  console.error(
    `Nothing answers at ${baseUrl}. Start the app (pnpm dev, or pnpm build && pnpm start) or pass --base-url.\n${(error as Error).message}`,
  );
  process.exit(2);
}

const pageSize = await detectPageSize();
const results: Result[] = [];
for (const c of selected) {
  if (c.kind === "scale" && !args.scale) {
    results.push({ id: c.id, status: "skip", detail: "needs --scale", ms: 0 });
    continue;
  }
  const started = performance.now();
  let check: Check;
  try {
    check = await runCase(c, csv, pageSize);
  } catch (error) {
    check = {
      pass: false,
      detail: (error as Error).message.split("\n")[0] ?? "",
    };
  }
  const result: Result = {
    id: c.id,
    status: check.pass ? "pass" : "fail",
    detail: check.detail,
    ms: Math.round(performance.now() - started),
  };
  results.push(result);
  process.stdout.write(
    `${result.status.padEnd(4)}  ${c.id}  ${result.detail}\n`,
  );
}

const caseIds = CASES.map((c) => c.id);

const count = (status: Result["status"]) =>
  results.filter((r) => r.status === status).length;
const commit = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
  } catch {
    return "unknown";
  }
})();

const lines = [
  "# Exercise evals",
  "",
  `Commit ${commit}, app at ${baseUrl}, ${new Date().toISOString()}.`,
  "",
  `**${count("pass")} pass, ${count("fail")} fail, ${count("skip")} skipped** of ${results.length} cases.`,
  "",
  "| Case | Result | Detail |",
  "| --- | --- | --- |",
  ...results.map(
    (r) => `| \`${r.id}\` | ${r.status} | ${r.detail.replace(/\|/g, "\\|")} |`,
  ),
];

let exitCode = 0;
if (args.baseline) {
  const diff = diffBaseline(baseline!, results, caseIds);
  const holds = baselineHolds(diff);
  lines.push("", "## Baseline", "");
  if (holds) {
    lines.push(`Matches \`${args.baseline}\`.`);
  } else {
    exitCode = 1;
    const list = (ids: string[]) => ids.map((id) => `\`${id}\``).join(", ");
    const update = `update the baseline: \`pnpm evals:exercise --out evals/runs/local --scale --write-baseline ${args.baseline}\` against your running app, and commit the file. Editing the JSON by hand is fine too.`;
    if (diff.regressed.length > 0) {
      lines.push(
        `- **Regressed** (passed before, fail now): ${list(diff.regressed)}. Fix the app. The detail column above says what the page showed.`,
      );
    }
    if (diff.improved.length > 0) {
      lines.push(
        `- **Now passing**: ${list(diff.improved)}. Lock them in so they cannot quietly fail later: ${update}`,
      );
    }
    if (diff.unlisted.length > 0) {
      lines.push(
        `- **Not in the baseline**: ${list(diff.unlisted)}. Add them: ${update}`,
      );
    }
    if (diff.unknown.length > 0) {
      lines.push(
        `- **In the baseline but no such case**: ${list(diff.unknown)}. Remove them: ${update}`,
      );
    }
  }
}

mkdirSync(args.out, { recursive: true });
writeFileSync(
  join(args.out, "results.jsonl"),
  results.map((r) => JSON.stringify(r)).join("\n") + "\n",
);
const summary = lines.join("\n") + "\n";
writeFileSync(join(args.out, "summary.md"), summary);

if (args["write-baseline"]) {
  const path = args["write-baseline"];
  const previous = previousBaseline!;
  const accept = args["accept-regressions"];
  const next = nextBaseline(previous, results, caseIds, accept);
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n");
  process.stdout.write(`\nWrote ${path}\n`);
  const kept = diffBaseline(previous, results, caseIds).regressed;
  if (kept.length > 0 && !accept) {
    console.error(
      `Kept "pass" for ${kept.join(", ")}: they passed before and fail now. Fix the app, or rerun with --accept-regressions and explain why in the PR.`,
    );
    exitCode = 1;
  }
}

process.stdout.write(`\n${summary}`);
process.exit(exitCode);
