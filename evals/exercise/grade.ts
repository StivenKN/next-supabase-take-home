import { CSV_COLUMNS, type CsvRow } from "./oracle.ts";

export type Status = "pass" | "fail" | "skip";

export type Result = {
  id: string;
  status: Status;
  /** One line a person can act on. */
  detail: string;
  ms: number;
};

/**
 * The pages to request for a result of `total` rows. Small results are
 * walked in full. Large ones check the first two pages and the last, which
 * also proves the total: the last page only has the right rows when the
 * app counted every match.
 */
export function pagesToCheck(total: number, pageSize: number): number[] {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 3) return Array.from({ length: last }, (_, i) => i + 1);
  return [1, 2, last];
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
export function compareIds(
  got: number[],
  want: number[],
): string | null {
  if (got.length === want.length && got.every((id, i) => id === want[i])) {
    return null;
  }
  const wanted = new Set(want);
  const shown = new Set(got);
  const extra = got.filter((id) => !wanted.has(id));
  const missing = want.filter((id) => !shown.has(id));
  const parts: string[] = [`showed ${got.length} rows, expected ${want.length}`];
  if (extra.length > 0) parts.push(`unexpected IDs ${sample(extra)}`);
  if (missing.length > 0) parts.push(`missing IDs ${sample(missing)}`);
  if (extra.length === 0 && missing.length === 0) {
    parts.push(`same IDs in a different order (first: ${sample(got)})`);
  }
  return parts.join("; ");
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
    return stored === csv || (/^-?\d/.test(csv) && Number(stored) === Number(csv));
  }
  return false;
}

/**
 * Compares every CSV row with the stored row of the same ID. Returns one
 * line per problem, at most `limit` of them.
 */
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
 * their old entry, and entries for removed cases are dropped.
 */
export function nextBaseline(
  baseline: Baseline,
  results: Result[],
  caseIds: string[],
): Baseline {
  const next: Baseline = {};
  for (const id of caseIds) {
    const result = results.find((r) => r.id === id);
    if (result && result.status !== "skip") next[id] = result.status;
    else next[id] = baseline[id] ?? "fail";
  }
  return next;
}
