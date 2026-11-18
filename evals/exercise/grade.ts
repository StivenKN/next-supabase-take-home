import { CSV_COLUMNS, type CsvColumn, type CsvRow } from "./oracle.ts";
import type { Page, PageTable } from "./page.ts";

export type Status = "pass" | "fail" | "skip";

export type Result = {
  id: string;
  status: Status;
  detail: string;
  ms: number;
};

/**
 * The pages to request for a result of `total` rows. Small results are
 * walked in full. Large ones check the first two pages and the last. The
 * page after the last must show no rows. Together these prove the app
 * counted every match, no more and no fewer.
 */
export function pagesToCheck(total: number, pageSize: number): number[] {
  if (total === 0) return [1];
  const last = Math.ceil(total / pageSize);
  const pages =
    last <= 3 ? Array.from({ length: last }, (_, i) => i + 1) : [1, 2, last];
  return [...pages, last + 1];
}

export function expectedOnPage(
  expected: number[],
  page: number,
  pageSize: number,
): number[] {
  return expected.slice((page - 1) * pageSize, page * pageSize);
}

const sample = (ids: number[]) =>
  ids.length > 5
    ? `${ids.slice(0, 5).join(", ")} and ${ids.length - 5} more`
    : ids.join(", ");

/** Null when the page shows exactly the expected IDs in order. */
export function compareIds(got: number[], want: number[]): string | null {
  if (got.length === want.length && got.every((id, i) => id === want[i])) {
    return null;
  }
  const wanted = new Set(want);
  const shown = new Set(got);
  const extra = got.filter((id) => !wanted.has(id));
  const missing = want.filter((id) => !shown.has(id));
  const parts: string[] = [
    `showed ${got.length} rows, expected ${want.length}`,
  ];
  if (extra.length > 0) parts.push(`unexpected IDs ${sample(extra)}`);
  if (missing.length > 0) parts.push(`missing IDs ${sample(missing)}`);
  if (extra.length === 0 && missing.length === 0) {
    parts.push(`same IDs in a different order (first: ${sample(got)})`);
  }
  return parts.join("; ");
}

/**
 * Null when the page shows what a person should see: exactly the expected
 * rows, or, when none are expected, no rows and a message saying so. A page
 * with no table and no message (an error page, a stuck loading state) fails.
 *
 * `emptyTable: "enough"` relaxes the empty case: an empty data table also passes.
 * Filter cases use it for the page after the last, where the point is to
 * prove the total, and the wording of an out-of-range page has its own case.
 */
export function judgePage(
  page: Page,
  want: number[],
  noRowsText: RegExp,
  emptyTable: "enough" | "needs-message" = "needs-message",
): string | null {
  const got = page.table?.ids ?? [];
  if (want.length === 0 && got.length === 0) {
    if (noRowsText.test(page.text)) return null;
    if (emptyTable === "enough" && page.table) return null;
    return `shows no rows and no message matching ${noRowsText}`;
  }
  if (!page.table) return "shows no table with an ID column";
  return compareIds(got, want);
}

/**
 * Null when every shown row reads exactly the CSV's value in each of
 * `columns`, in that column: `headers` says which header belongs to which
 * CSV column. Catches a table that shows the right IDs with wrong, missing,
 * or swapped data. It expects the CSV's own words ("None", "Good"), so an
 * app that relabels them needs a matching change here.
 */
export function compareCells(
  table: Pick<PageTable, "headers" | "ids" | "cells">,
  csvById: Map<number, CsvRow>,
  headers: Partial<Record<CsvColumn, RegExp>>,
): string | null {
  const index = new Map<CsvColumn, number>();
  for (const [column, pattern] of Object.entries(headers) as [
    CsvColumn,
    RegExp,
  ][]) {
    const i = table.headers.findIndex((header) => pattern.test(header));
    if (i === -1) return `no column header matches ${pattern} (${column})`;
    index.set(column, i);
  }
  for (const [r, id] of table.ids.entries()) {
    const row = csvById.get(id);
    if (!row) return `ID ${id} is not in the CSV`;
    const cells = table.cells[r] ?? [];
    for (const [column, i] of index) {
      if (cells[i] !== row[column]) {
        return `ID ${id} ${column}: CSV "${row[column]}", page "${cells[i] ?? ""}"`;
      }
    }
  }
  return null;
}

/**
 * Whether a value read back from Postgres equals the CSV text. Numbers
 * compare by value ("3.0" equals 3), and the 0/1 columns may be stored as
 * booleans.
 */
export function sameValue(csv: string, stored: unknown): boolean {
  if (typeof stored === "boolean") return csv === (stored ? "1" : "0");
  if (typeof stored === "number") return Number(csv) === stored;
  if (typeof stored === "string") {
    return (
      stored === csv || (/^-?\d/.test(csv) && Number(stored) === Number(csv))
    );
  }
  return false;
}

export function compareRows(
  csv: CsvRow[],
  stored: Record<string, unknown>[],
  columnFor: (csvHeader: string) => string,
  limit = 5,
): string[] {
  const problems: string[] = [];
  const byId = new Map<number, Record<string, unknown>>();
  for (const row of stored) byId.set(Number(row[columnFor("ID")]), row);
  for (const row of csv) {
    if (problems.length >= limit) break;
    const found = byId.get(Number(row.ID));
    if (!found) {
      problems.push(`ID ${row.ID} is missing`);
      continue;
    }
    for (const column of CSV_COLUMNS) {
      const key = columnFor(column);
      if (!(key in found)) {
        problems.push(`no column ${key} for ${column}`);
        return problems;
      }
      if (!sameValue(row[column], found[key])) {
        problems.push(
          `ID ${row.ID} ${column}: CSV ${row[column]}, stored ${JSON.stringify(found[key])}`,
        );
        break;
      }
    }
  }
  return problems;
}

export type Baseline = Record<string, "pass" | "fail">;

/**
 * The baseline from its JSON text, or what is wrong with it. Any value other
 * than "pass" or "fail" would silently stop that case from being enforced.
 */
export function parseBaseline(text: string): Baseline | string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "is not valid JSON.";
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return 'must be an object of case IDs to "pass" or "fail".';
  }
  for (const [id, status] of Object.entries(value)) {
    if (status !== "pass" && status !== "fail") {
      return `has ${JSON.stringify(status)} for ${id}; use "pass" or "fail".`;
    }
  }
  return value as Baseline;
}

export type BaselineDiff = {
  /** Passed in the baseline, fail now. */
  regressed: string[];
  /** Failed in the baseline, pass now. The baseline must be updated. */
  improved: string[];
  /** Ran, but the baseline does not list them. */
  unlisted: string[];
  /** Listed in the baseline, but no case has that ID. */
  unknown: string[];
};

/** Skipped cases are left out. Only cases that ran are compared. */
export function diffBaseline(
  baseline: Baseline,
  results: Result[],
  caseIds: string[],
): BaselineDiff {
  const diff: BaselineDiff = {
    regressed: [],
    improved: [],
    unlisted: [],
    unknown: Object.keys(baseline).filter((id) => !caseIds.includes(id)),
  };
  for (const result of results) {
    if (result.status === "skip") continue;
    const before = baseline[result.id];
    if (before === undefined) diff.unlisted.push(result.id);
    else if (before === "pass" && result.status === "fail") {
      diff.regressed.push(result.id);
    } else if (before === "fail" && result.status === "pass") {
      diff.improved.push(result.id);
    }
  }
  return diff;
}

export function baselineHolds(diff: BaselineDiff): boolean {
  return Object.values(diff).every((ids) => ids.length === 0);
}

/**
 * The new baseline: cases that ran take their result, skipped cases keep
 * their old entry, and entries for removed cases are dropped. A case that
 * passed before keeps `pass` even if it fails now, unless
 * `acceptRegressions`: the baseline only moves backwards on purpose.
 */
export function nextBaseline(
  baseline: Baseline,
  results: Result[],
  caseIds: string[],
  acceptRegressions = false,
): Baseline {
  const next: Baseline = {};
  for (const id of caseIds) {
    const result = results.find((r) => r.id === id);
    if (!result || result.status === "skip") next[id] = baseline[id] ?? "fail";
    else if (baseline[id] === "pass" && !acceptRegressions) next[id] = "pass";
    else next[id] = result.status;
  }
  return next;
}
