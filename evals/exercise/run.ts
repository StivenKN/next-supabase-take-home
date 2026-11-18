/**
 * Runs the exercise cases against the running app and the local database.
 * See README.md next to this file.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { ID_HEADER, NO_ROWS_TEXT, ROUTE, TABLE, columnFor, urlFor } from "./app.ts";
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
    console.error(`Cannot read the baseline ${path}: ${(error as Error).message}`);
    process.exit(2);
  }
  try {
    return JSON.parse(text) as Baseline;
  } catch {
    console.error(`The baseline ${path} is not valid JSON.`);
    process.exit(2);
  }
};

// Read before running, so a wrong path fails fast.
const baseline = args.baseline ? readBaseline(args.baseline, false) : undefined;

// ---------------------------------------------------------------------------
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

/** Runs SQL and returns psql's unaligned output. Throws with psql's error. */
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

/** A fingerprint of every row, to tell whether anything changed. */
const checksum = () =>
  sql(
    `select count(*) || ':' || coalesce(md5(string_agg(t::text, ',' order by t.${columnFor("ID")})), '') from ${TABLE} t`,
  );

// ---------------------------------------------------------------------------
// The app

type Fetched = { status: number; html: string; ms: number };

const TIMEOUT_MS = 30_000;

async function get(path: string, retry = true): Promise<Fetched> {
  const started = performance.now();
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
      return get(path, false);
    }
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
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
    if (table.ids.length === 0) return `GET ${ROUTE} shows a table with no rows`;
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
 * filter cases only use it to prove the total, so an empty table is enough
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

// ---------------------------------------------------------------------------
// Cases

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
      const before = checksum();
      const { problem } = await checkPages(
        c.filter,
        expectedIds(csv, c.filter),
        size,
        [c.page],
        "needs-message",
      );
      if (problem) return { pass: false, detail: problem };
      if (checksum() !== before) {
        return { pass: false, detail: `${urlFor(c.filter, c.page)} changed the data` };
      }
      return {
        pass: true,
        detail: `${urlFor(c.filter, c.page)} shows the expected rows; data unchanged`,
      };
    }

    case "values": {
      const response = await get(ROUTE);
      const { table } = readPage(response.html, ID_HEADER);
      if (!table || table.ids.length === 0) {
        return { pass: false, detail: `${ROUTE} shows no data table` };
      }
      const problem = compareCells(table, csvById, c.columns);
      return problem
        ? { pass: false, detail: problem }
        : {
            pass: true,
            detail: `${table.ids.length} rows show their ${c.columns.join(", ")}`,
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

/**
 * Copies the dataset `copies - 1` more times with shifted IDs, checks and
 * times the page, then deletes the copies again.
 */
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
  const [schema, table] = TABLE.split(".");
  const id = columnFor("ID");
  // Generated columns fill themselves in, so they are left out.
  const columns = sql(
    `select column_name from information_schema.columns where table_schema = '${schema}' and table_name = '${table}' and is_generated = 'NEVER' order by ordinal_position`,
  ).split("\n");
  const select = columns
    .map((column) => (column === id ? `${id} + k * ${csv.length}` : column))
    .join(", ");

  const removeCopies = () =>
    sql(`delete from ${TABLE} where ${id} > ${csv.length}`, `vacuum analyze ${TABLE}`);
  // Ctrl-C must not leave a million rows behind.
  const onSignal = () => {
    console.error("\nStopped. Removing the scale copies first.");
    removeCopies();
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    const grew = performance.now();
    sql(
      `insert into ${TABLE} (${columns.join(", ")}) overriding system value select ${select} from ${TABLE}, generate_series(1, ${c.copies - 1}) as k where ${id} <= ${csv.length}`,
      `analyze ${TABLE}`,
    );
    const growSeconds = ((performance.now() - grew) / 1000).toFixed(1);

    const total = rowCount();
    if (total !== csv.length * c.copies) {
      return { pass: false, detail: `grew to ${total} rows, expected ${csv.length * c.copies}` };
    }

    const timings: string[] = [];
    let slowest = 0;
    // Every filter's first page, plus a page from the middle of the table.
    const checks: { filter: Filter; page: number }[] = [
      ...c.filters.map((filter) => ({ filter, page: 1 })),
      { filter: {}, page: Math.ceil(total / pageSize / 2) },
    ];
    for (const { filter, page } of checks) {
      const expected = expectedIdsScaled(csv, filter, c.copies);
      // Three requests: a cache can make the second one fast, but the first
      // is what a person changing a filter waits for. Only the response is
      // timed, not the evals reading the page.
      const times: number[] = [];
      for (let i = 0; i < 3; i++) {
        const { problem, slowestMs } = await checkPages(filter, expected, pageSize, [page]);
        times.push(slowestMs);
        if (problem) return { pass: false, detail: `at ${total} rows, ${problem}` };
      }
      const worst = Math.max(...times);
      slowest = Math.max(slowest, worst);
      timings.push(`${urlFor(filter, page)} ${times.map((t) => Math.round(t)).join("/")} ms`);
    }
    return {
      pass: slowest <= c.maxMs,
      detail: `${total} rows (grown in ${growSeconds} s); slowest ${Math.round(slowest)} ms, limit ${c.maxMs} ms; ${timings.join("; ")}`,
    };
  } finally {
    removeCopies();
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}

// ---------------------------------------------------------------------------
// Run

const csv = parseCsv(
  readFileSync(join(root, "data/synthetic_coffee_health_10000.csv"), "utf8"),
);
const csvById = new Map(csv.map((row) => [Number(row.ID), row]));
const selected = args.case
  ? CASES.filter((c) => args.case!.includes(c.id))
  : CASES;
const unknownCases = (args.case ?? []).filter((id) => !CASES.some((c) => c.id === id));
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
    check = { pass: false, detail: (error as Error).message.split("\n")[0] ?? "" };
  }
  const result: Result = {
    id: c.id,
    status: check.pass ? "pass" : "fail",
    detail: check.detail,
    ms: Math.round(performance.now() - started),
  };
  results.push(result);
  console.log(`${result.status.padEnd(4)}  ${c.id}  ${result.detail}`);
}

// ---------------------------------------------------------------------------
// Report

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
      lines.push(`- **Regressed** (passed before, fail now): ${list(diff.regressed)}. Fix the app. The detail column above says what the page showed.`);
    }
    if (diff.improved.length > 0) {
      lines.push(`- **Now passing**: ${list(diff.improved)}. Lock them in so they cannot quietly fail later: ${update}`);
    }
    if (diff.unlisted.length > 0) {
      lines.push(`- **Not in the baseline**: ${list(diff.unlisted)}. Add them: ${update}`);
    }
    if (diff.unknown.length > 0) {
      lines.push(`- **In the baseline but no such case**: ${list(diff.unknown)}. Remove them: ${update}`);
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
  const previous = readBaseline(path, true);
  const accept = args["accept-regressions"];
  const next = nextBaseline(previous, results, caseIds, accept);
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n");
  console.log(`\nWrote ${path}`);
  const kept = diffBaseline(previous, results, caseIds).regressed;
  if (kept.length > 0 && !accept) {
    console.error(
      `Kept "pass" for ${kept.join(", ")}: they passed before and fail now. Fix the app, or rerun with --accept-regressions and explain why in the PR.`,
    );
    exitCode = 1;
  }
}

console.log(`\n${summary}`);
process.exit(exitCode);
