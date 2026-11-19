import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getPage, type PageResult } from "./queries";
import {
  CHOICE_KEYS,
  DEFAULT_STATE,
  ENUM_OPTIONS,
  FLAG_KEYS,
  PAGE_SIZE,
  RANGE_KEYS,
  RANGE_STEPS,
  SORT_KEYS,
  type ChoiceKey,
  type ExplorerState,
  type FlagKey,
  type Range,
  type RangeKey,
  type SortKey,
} from "./schema";
import { hrefForState, parseSearchParams } from "./search-params";

/*
 * Property: for any filters and sort a person can put in the URL, following
 * the pager's links from page 1 to the last page shows every row of the CSV
 * that matches the filters exactly once, in the chosen order, and every page
 * reports the same match count. The page after the last says it is past the
 * end. See .agents/skills/verify-coffee-health-pagination/SKILL.md.
 *
 * The expected rows come from data/synthetic_coffee_health_10000.csv, not from
 * the app. The rows shown come from the app's own getPage() against the local
 * Supabase stack, with each page's state read back from the link the pager
 * renders (hrefForState -> URL -> parseSearchParams), as the server does.
 */

type Key = ChoiceKey | RangeKey | FlagKey | SortKey;
type CsvRow = { id: number } & Record<Key, string | number | boolean>;

const CSV_PATH = "data/synthetic_coffee_health_10000.csv";
const STRING_COLUMNS = new Set<string>([...CHOICE_KEYS]);
const FLAG_COLUMNS = new Set<string>([...FLAG_KEYS]);

function loadCsv(): CsvRow[] {
  const [header, ...lines] = readFileSync(CSV_PATH, "utf8")
    .split(/\r?\n/)
    .filter((line) => line !== "");
  const columns = (header ?? "").split(",").map((name) => name.toLowerCase());
  return lines.map((line) => {
    const values = line.split(",");
    if (values.length !== columns.length) {
      throw new Error(`${CSV_PATH}: unexpected line ${line}`);
    }
    const row: Record<string, string | number | boolean> = {};
    columns.forEach((column, index) => {
      const raw = values[index] ?? "";
      row[column] = STRING_COLUMNS.has(column)
        ? raw
        : FLAG_COLUMNS.has(column)
          ? raw === "1"
          : Number(raw);
    });
    return row as CsvRow;
  });
}

const CSV = loadCsv();
const COUNTRIES = [...new Set(CSV.map((row) => String(row.country)))];

function matches(row: CsvRow, state: ExplorerState): boolean {
  for (const key of CHOICE_KEYS) {
    const values = state.choices[key];
    if (values.length > 0 && !values.includes(String(row[key]))) return false;
  }
  for (const key of RANGE_KEYS) {
    const { min, max } = state.ranges[key];
    const value = Number(row[key]);
    if (min !== null && value < min) return false;
    if (max !== null && value > max) return false;
  }
  for (const key of FLAG_KEYS) {
    const flag = state.flags[key];
    if (flag !== null && row[key] !== flag) return false;
  }
  return true;
}

function compareKeys(a: string | number, b: string | number): number {
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b, "en");
  }
  return Number(a) - Number(b);
}

const CSV_BY_ID = new Map(CSV.map((row) => [row.id, row]));

function sortValue(id: number, column: SortKey): string | number {
  const row = CSV_BY_ID.get(id);
  if (!row) throw new Error(`ID ${id} is not in ${CSV_PATH}`);
  return row[column] as string | number;
}

/** What the server sees when a person opens the link the app renders for this state. */
function followLink(state: ExplorerState): ExplorerState {
  const href = hrefForState("/", state);
  const params: Record<string, string | string[]> = {};
  for (const [key, value] of new URL(href, "http://localhost").searchParams) {
    const previous = params[key];
    params[key] =
      previous === undefined
        ? value
        : [...(Array.isArray(previous) ? previous : [previous]), value];
  }
  return parseSearchParams(params);
}

/** The view in plain words, written without the app's URL code. */
function describeState(state: ExplorerState): string {
  const parts: string[] = [];
  for (const key of CHOICE_KEYS) {
    const values = state.choices[key];
    if (values.length > 0) parts.push(`${key} in ${JSON.stringify(values)}`);
  }
  for (const key of RANGE_KEYS) {
    const { min, max } = state.ranges[key];
    if (min !== null || max !== null)
      parts.push(`${key} ${min ?? ""}..${max ?? ""}`);
  }
  for (const key of FLAG_KEYS) {
    const flag = state.flags[key];
    if (flag !== null) parts.push(`${key} ${flag ? "yes" : "no"}`);
  }
  const { column, ascending } = state.sort;
  parts.push(`sorted by ${column} ${ascending ? "ascending" : "descending"}`);
  return parts.join(", ");
}

function sameMeaning(a: ExplorerState, b: ExplorerState): boolean {
  const asSets = (state: ExplorerState) => ({
    ...state,
    choices: Object.fromEntries(
      CHOICE_KEYS.map((key) => [key, [...state.choices[key]].sort()]),
    ),
  });
  try {
    expect(asSets(a)).toEqual(asSets(b));
    return true;
  } catch {
    return false;
  }
}

/**
 * Walks every page of `start`'s results through the pager's links and throws
 * a plain-language error at the first difference from the CSV.
 */
const walked = { states: 0, empty: 0, pages: 0 };

async function walk(start: ExplorerState): Promise<void> {
  const where = `[${describeState(start)}] (${hrefForState("/", { ...start, page: 1 })})`;
  const first = followLink({ ...start, page: 1 });
  if (!sameMeaning(first, { ...start, page: 1 })) {
    throw new Error(
      `${where}: the app's link reads back as [${describeState(first)}]`,
    );
  }

  const { column, ascending } = first.sort;
  const expected = CSV.filter((row) => matches(row, first))
    .map((row) => row.id)
    .sort((a, b) => {
      const byKey = compareKeys(sortValue(a, column), sortValue(b, column));
      return (ascending ? 1 : -1) * (byKey !== 0 ? byKey : a - b);
    });
  const last = Math.max(1, Math.ceil(expected.length / PAGE_SIZE));
  walked.states += 1;
  walked.pages += last;
  if (expected.length === 0) walked.empty += 1;

  const shown: number[] = [];
  const pageOf = new Map<number, number>();
  for (let page = 1; page <= last; page++) {
    const state = followLink({ ...first, page });
    if (!sameMeaning(state, { ...first, page })) {
      throw new Error(
        `${where}: the link to page ${page} reads back as [${describeState(state)}], page ${state.page}`,
      );
    }
    const result: PageResult = await getPage(state);
    if (result.status !== "ok") {
      throw new Error(
        `${where}: page ${page} of ${last} answered ${JSON.stringify(result)}`,
      );
    }
    if (result.count !== expected.length) {
      throw new Error(
        `${where}: page ${page} says ${result.count} rows match, the CSV has ${expected.length}`,
      );
    }
    const wanted = Math.min(
      PAGE_SIZE,
      expected.length - (page - 1) * PAGE_SIZE,
    );
    if (result.rows.length !== wanted) {
      throw new Error(
        `${where}: page ${page} shows ${result.rows.length} rows, expected ${wanted}`,
      );
    }
    for (const row of result.rows) {
      const earlier = pageOf.get(row.id);
      if (earlier !== undefined) {
        throw new Error(
          `${where}: ID ${row.id} is shown on page ${earlier} and again on page ${page}`,
        );
      }
      pageOf.set(row.id, page);
      shown.push(row.id);
    }
  }

  const wantedIds = new Set(expected);
  const extra = shown.find((id) => !wantedIds.has(id));
  if (extra !== undefined) {
    throw new Error(
      `${where}: ID ${extra} is shown on page ${pageOf.get(extra)} but does not match the filters`,
    );
  }
  const missing = expected.find((id) => !pageOf.has(id));
  if (missing !== undefined) {
    throw new Error(
      `${where}: ID ${missing} matches the filters but is on none of the ${last} pages`,
    );
  }
  for (let i = 1; i < shown.length; i++) {
    const before = shown[i - 1] ?? 0;
    const after = shown[i] ?? 0;
    const order = compareKeys(
      sortValue(before, column),
      sortValue(after, column),
    );
    if ((ascending ? order : -order) > 0) {
      throw new Error(
        `${where}: sorted by ${column} ${ascending ? "ascending" : "descending"}, ` +
          `ID ${before} (${sortValue(before, column)}) comes before ID ${after} (${sortValue(after, column)})`,
      );
    }
  }

  // PostgREST treats the page right after the last and pages further out
  // differently (getPage handles both), so check one of each.
  for (const page of [last + 1, last + 3]) {
    const result = await getPage(followLink({ ...first, page }));
    if (result.status !== "out-of-range" || result.count !== expected.length) {
      throw new Error(
        `${where}: page ${page}, past the last page ${last}, answered ${JSON.stringify(result)}; ` +
          `expected out-of-range with count ${expected.length}`,
      );
    }
  }
}

// A bound as the app stores it: a whole number for age, one decimal otherwise.
// Bounds are drawn from the column's values in the CSV, so they fall where the
// rows are and often land exactly on a row's value (inclusive bounds), then
// nudged by one step either way. A few fall outside the data's span. Most
// ranges are left open or ordered; about one in 24 is inverted (min above max).
function rangeArb(key: RangeKey): fc.Arbitrary<Range> {
  const step = RANGE_STEPS[key];
  const scale = step === 1 ? 1 : 10;
  const values = CSV.map((row) => Number(row[key])).sort((a, b) => a - b);
  const lowest = values[0] ?? 0;
  const highest = values[values.length - 1] ?? 0;
  const near = fc
    .tuple(fc.constantFrom(...values), fc.constantFrom(-1, 0, 0, 0, 1))
    .map(([value, nudge]) =>
      Math.max(0, Math.round((value + nudge * step) * scale) / scale),
    );
  const outside = fc.constantFrom(
    Math.max(0, lowest - step * 5),
    Math.round((highest + step * 5) * scale) / scale,
  );
  const bound = fc.oneof(
    { weight: 9, arbitrary: near },
    { weight: 1, arbitrary: outside },
  );
  return fc.oneof(
    { weight: 8, arbitrary: fc.constant({ min: null, max: null }) },
    { weight: 1, arbitrary: bound.map((b) => ({ min: b, max: null })) },
    { weight: 1, arbitrary: bound.map((b) => ({ min: null, max: b })) },
    {
      weight: 1,
      arbitrary: fc
        .tuple(bound, bound)
        .map(([a, b]) => ({ min: Math.min(a, b), max: Math.max(a, b) })),
    },
    {
      weight: 1,
      arbitrary: fc.tuple(bound, bound).map(([a, b]) => ({ min: a, max: b })),
    },
  );
}

// Country is free text in the URL. Besides the real countries, try values
// that match nothing, including PostgREST syntax. parseChoices drops quotes,
// backslashes, commas, blanks, and values over 60 characters, so those are
// not states the app can reach.
const junkCountry = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter(
    (value) => value === value.trim() && value !== "" && !/[",\\]/.test(value),
  );

function choiceArb(key: ChoiceKey): fc.Arbitrary<string[]> {
  const options: readonly string[] =
    key === "country" ? COUNTRIES : ENUM_OPTIONS[key];
  const picked =
    key === "country"
      ? fc
          .tuple(
            fc.subarray([...options], { minLength: 1, maxLength: 6 }),
            fc.array(junkCountry, { maxLength: 2 }),
          )
          .map(([real, junk]) => [...new Set([...real, ...junk])])
      : fc.subarray([...options], { minLength: 1 });
  return fc.oneof(
    { weight: 4, arbitrary: fc.constant([] as string[]) },
    { weight: 1, arbitrary: picked },
  );
}

const flagArb = fc.oneof(
  { weight: 2, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: fc.boolean() },
);

const stateArb: fc.Arbitrary<ExplorerState> = fc.record({
  choices: fc.record(
    Object.fromEntries(CHOICE_KEYS.map((key) => [key, choiceArb(key)])) as {
      [K in ChoiceKey]: fc.Arbitrary<string[]>;
    },
  ),
  ranges: fc.record(
    Object.fromEntries(RANGE_KEYS.map((key) => [key, rangeArb(key)])) as {
      [K in RangeKey]: fc.Arbitrary<Range>;
    },
  ),
  flags: fc.record({ smoking: flagArb, alcohol_consumption: flagArb }),
  sort: fc.record({
    column: fc.constantFrom(...SORT_KEYS),
    ascending: fc.boolean(),
  }),
  page: fc.constant(1),
});

const RUNS = Number(process.env.VERIFY_RUNS ?? 100);
const SEED =
  process.env.VERIFY_SEED === undefined
    ? undefined
    : Number(process.env.VERIFY_SEED);

describe("coffee_health pagination", () => {
  it("the database holds exactly the CSV's rows (precondition)", async () => {
    // Counted without the app's query code, so a bug in getPage cannot pass
    // for an empty or half-loaded table here.
    const { count, error } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      { auth: { persistSession: false } },
    )
      .from("coffee_health")
      .select("id", { count: "exact", head: true });
    if (error || count !== CSV.length) {
      throw new Error(
        `Setup: expected public.coffee_health to hold the ${CSV.length} CSV rows, ` +
          `found ${error ? `error ${error.code} ${error.message}` : count}. ` +
          "Start Supabase, run `pnpm setup:env`, then `pnpm db:load`.",
      );
    }
  });

  it("walks every page of every sort, unfiltered", async () => {
    for (const column of SORT_KEYS) {
      for (const ascending of [true, false]) {
        await walk({ ...DEFAULT_STATE, sort: { column, ascending } });
      }
    }
  });

  it("walks every page of generated filters and sorts", async () => {
    Object.assign(walked, { states: 0, empty: 0, pages: 0 });
    await fc.assert(
      fc.asyncProperty(stateArb, async (state) => {
        await walk(state);
      }),
      { numRuns: RUNS, seed: SEED },
    );
    console.warn(
      `Walked ${walked.states} views (${walked.empty} with no matching rows), ${walked.pages} pages in all.`,
    );
  });
});
