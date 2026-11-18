/**
 * Runs the exercise cases against the running app and the local database.
 * See README.md next to this file.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { ID_HEADER, ROUTE, TABLE, columnFor, urlFor } from "./app.ts";
import { CASES, type Case } from "./cases.ts";
import {
  baselineHolds,
  compareIds,
  compareRows,
  diffBaseline,
  expectedOnPage,
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
import { readTable } from "./page.ts";

const root = new URL("../../", import.meta.url).pathname;

const { values: args } = parseArgs({
  options: {
    out: { type: "string" },
    "base-url": { type: "string", default: "http://localhost:3000" },
    case: { type: "string", multiple: true },
    scale: { type: "boolean", default: false },
    baseline: { type: "string" },
    "write-baseline": { type: "string" },
  },
});

if (!args.out) {
  console.error(
    "Usage: pnpm evals:exercise --out <dir> [--base-url <url>] [--case <id>]... [--scale] [--baseline <file>] [--write-baseline <file>]",
  );
  process.exit(2);
}
const baseUrl = args["base-url"].replace(/\/$/, "");

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

// ---------------------------------------------------------------------------
// The app

type Fetched = { status: number; html: string; ms: number };

async function get(path: string, retry = true): Promise<Fetched> {
  const started = performance.now();
  try {
    const response = await fetch(baseUrl + path, { redirect: "follow" });
    const html = await response.text();
    return { status: response.status, html, ms: performance.now() - started };
  } catch (error) {
    // The server closes idle keep-alive connections after a few seconds, and
    // fetch can pick one up just as it closes. That is the connection, not
    // the app, so one retry. HTTP errors are never retried.
    if (retry) return get(path, false);
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
    const table = readTable(page.html, ID_HEADER);
    if (!table) return `GET ${ROUTE} has no table with an ${ID_HEADER} column`;
    if (table.ids.length === 0) return `GET ${ROUTE} shows a table with no rows`;
    return table.ids.length;
  } catch (error) {
    return `GET ${baseUrl}${ROUTE} failed: ${(error as Error).message}`;
  }
}

/** Null when every checked page shows exactly the expected rows. */
async function checkPages(
  filter: Filter,
  expected: number[],
  pageSize: number,
  pages = pagesToCheck(expected.length, pageSize),
): Promise<string | null> {
  for (const page of pages) {
    const url = urlFor(filter, page);
    const response = await get(url);
    if (response.status !== 200) return `${url} answered ${response.status}`;
    const ids = readTable(response.html, ID_HEADER)?.ids ?? [];
    const problem = compareIds(ids, expectedOnPage(expected, page, pageSize));
    if (problem) return `${url}: ${problem}`;
  }
  return null;
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
      const problem = await checkPages(c.filter, expected, size);
      const pages = pagesToCheck(expected.length, size);
      return problem
        ? { pass: false, detail: problem }
        : {
            pass: true,
            detail: `${expected.length} matching rows; pages ${pages.join(", ")} exact`,
          };
    }

    case "input": {
      const url = urlFor(c.filter, c.page);
      const before = rowCount();
      const response = await get(url);
      const after = rowCount();
      if (response.status >= 500) {
        return { pass: false, detail: `${url} answered ${response.status}` };
      }
      if (after !== before) {
        return {
          pass: false,
          detail: `${url} changed the table from ${before} to ${after} rows`,
        };
      }
      return {
        pass: true,
        detail: `${url} answered ${response.status}; data unchanged`,
      };
    }

    case "weight": {
      const response = await get(ROUTE);
      const table = readTable(response.html, ID_HEADER);
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
      detail: `needs the ${csv.length} CSV rows loaded first, found ${before}`,
    };
  }
  const [schema, table] = TABLE.split(".");
  const id = columnFor("ID");
  const columns = sql(
    `select column_name from information_schema.columns where table_schema = '${schema}' and table_name = '${table}' order by ordinal_position`,
  ).split("\n");
  const select = columns
    .map((column) => (column === id ? `${id} + k * ${csv.length}` : column))
    .join(", ");

  const grew = performance.now();
  sql(
    `insert into ${TABLE} (${columns.join(", ")}) select ${select} from ${TABLE}, generate_series(1, ${c.copies - 1}) as k where ${id} <= ${csv.length}`,
    `analyze ${TABLE}`,
  );
  const growSeconds = ((performance.now() - grew) / 1000).toFixed(1);

  try {
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
      // is what a person changing a filter waits for.
      const times: number[] = [];
      for (let i = 0; i < 3; i++) {
        const started = performance.now();
        const problem = await checkPages(filter, expected, pageSize, [page]);
        times.push(performance.now() - started);
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
    sql(`delete from ${TABLE} where ${id} > ${csv.length}`, `vacuum analyze ${TABLE}`);
  }
}

// ---------------------------------------------------------------------------
// Run

const csv = parseCsv(
  readFileSync(join(root, "data/synthetic_coffee_health_10000.csv"), "utf8"),
);
const selected = args.case
  ? CASES.filter((c) => args.case!.includes(c.id))
  : CASES;
const unknownCases = (args.case ?? []).filter((id) => !CASES.some((c) => c.id === id));
if (unknownCases.length > 0) {
  console.error(`Unknown case: ${unknownCases.join(", ")}`);
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
    check = { pass: false, detail: (error as Error).message.split("\n")[0] };
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
const readBaseline = (path: string): Baseline => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Baseline;
  } catch {
    return {};
  }
};

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
  const diff = diffBaseline(readBaseline(args.baseline), results, caseIds);
  const holds = baselineHolds(diff);
  lines.push("", "## Baseline", "");
  if (holds) {
    lines.push(`Matches \`${args.baseline}\`.`);
  } else {
    exitCode = 1;
    const list = (ids: string[]) => ids.map((id) => `\`${id}\``).join(", ");
    if (diff.regressed.length > 0) {
      lines.push(`- **Regressed** (passed before, fail now): ${list(diff.regressed)}. Fix the app.`);
    }
    if (diff.improved.length > 0) {
      lines.push(`- **Now passing**: ${list(diff.improved)}. Lock them in: run with \`--write-baseline ${args.baseline}\` and commit the file.`);
    }
    if (diff.unlisted.length > 0) {
      lines.push(`- **Not in the baseline**: ${list(diff.unlisted)}. Run with \`--write-baseline ${args.baseline}\` and commit the file.`);
    }
    if (diff.unknown.length > 0) {
      lines.push(`- **In the baseline but no such case**: ${list(diff.unknown)}. Run with \`--write-baseline ${args.baseline}\` and commit the file.`);
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
  const next = nextBaseline(readBaseline(path), results, caseIds);
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n");
  console.log(`\nWrote ${path}`);
}

console.log(`\n${summary}`);
process.exit(exitCode);
