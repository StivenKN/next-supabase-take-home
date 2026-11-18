import type { CsvColumn, Filter } from "./oracle.ts";

/**
 * Every case comes from a requirement in README.md ("Exercise"). `source`
 * names the part it checks.
 *
 * - `data`: the database holds the CSV.
 * - `page`: the page shows the rows a filter selects, in ID order, and every
 *   matching row is reachable through the pages.
 * - `values`: the rows on the first page show the CSV's values.
 * - `input`: a hostile or out-of-range URL shows the rows it matches (none),
 *   and the data is unchanged afterwards.
 * - `weight`: the page sends one page of rows, not the dataset.
 * - `scale`: grows the table to a million rows and times the page. It
 *   changes the database, so it only runs with `--scale`.
 */
export type Case = { id: string; source: string; what: string } & (
  | { kind: "row-count" }
  | { kind: "round-trip" }
  | { kind: "page"; filter: Filter }
  | { kind: "values"; columns: CsvColumn[] }
  | { kind: "input"; filter: Filter; page: number }
  | { kind: "weight"; maxRows: number; maxBytes: number }
  | {
      kind: "scale";
      copies: number;
      filters: Filter[];
      /** Slowest acceptable response, in milliseconds, for any one request. */
      maxMs: number;
    }
);

const PART_1 = "README Exercise, Part 1";
const PART_2 = "README Exercise, Part 2";
const PART_3 = "README Exercise, Part 3";

export const CASES: Case[] = [
  {
    id: "data/row-count",
    source: `${PART_1}, step 4`,
    what: "The table holds exactly as many rows as the CSV (10,000).",
    kind: "row-count",
  },
  {
    id: "data/round-trip",
    source: `${PART_1}, step 2`,
    what: "Every CSV row is stored with the same values in every column.",
    kind: "round-trip",
  },

  // Controls: no filter, so every row should be reachable.
  {
    id: "page/no-filter",
    source: PART_2,
    what: "With no filter the pages walk all 10,000 rows in ID order.",
    kind: "page",
    filter: {},
  },

  {
    id: "page/row-values",
    source: `${PART_2}, "displays the loaded data in a table"`,
    what: "Each row on the first page shows its gender, country, occupation, sleep quality, stress level, and health issues from the CSV.",
    kind: "values",
    columns: [
      "Gender",
      "Country",
      "Occupation",
      "Sleep_Quality",
      "Stress_Level",
      "Health_Issues",
    ],
  },

  {
    id: "page/country",
    source: `${PART_2}, "country"`,
    what: "One country shows only that country's rows.",
    kind: "page",
    filter: { choices: { country: ["Brazil"] } },
  },
  {
    id: "page/country-with-space",
    source: `${PART_2}, "country"`,
    what: "A country with a space in its name survives the URL.",
    kind: "page",
    filter: { choices: { country: ["South Korea"] } },
  },
  {
    id: "page/countries",
    source: `${PART_2}, "multi-select"`,
    what: "Several countries show rows from any of them.",
    kind: "page",
    filter: { choices: { country: ["Japan", "Mexico", "USA"] } },
  },
  {
    id: "page/gender",
    source: `${PART_2}, "gender"`,
    what: "The smallest gender group (226 rows) pages correctly.",
    kind: "page",
    filter: { choices: { gender: ["Other"] } },
  },
  {
    id: "page/sleep-quality",
    source: `${PART_2}, "sleep quality"`,
    what: "Two sleep qualities show rows with either one.",
    kind: "page",
    filter: { choices: { sleep_quality: ["Poor", "Excellent"] } },
  },
  {
    id: "page/stress-level",
    source: `${PART_2}, "stress level"`,
    what: "One stress level shows only rows with it.",
    kind: "page",
    filter: { choices: { stress_level: ["High"] } },
  },
  {
    id: "page/age-inclusive",
    source: `${PART_2}, "numeric ranges (age)", "min/max"`,
    what: "An age range includes rows at both bounds.",
    kind: "page",
    filter: { ranges: { age: { min: 30, max: 32 } } },
  },
  {
    id: "page/coffee-decimal-bounds",
    source: `${PART_2}, "numeric ranges (coffee intake)"`,
    what: "Decimal bounds (2.5 to 3.0) include rows exactly at 2.5 and 3.0.",
    kind: "page",
    filter: { ranges: { coffee_intake: { min: 2.5, max: 3 } } },
  },
  {
    id: "page/bmi-min-only",
    source: `${PART_2}, "numeric ranges (BMI)"`,
    what: "A minimum with no maximum keeps everything above it.",
    kind: "page",
    filter: { ranges: { bmi: { min: 35 } } },
  },
  {
    id: "page/combined",
    source: PART_2,
    what: "Filters on different columns all apply at once.",
    kind: "page",
    filter: {
      choices: {
        country: ["France", "Germany"],
        gender: ["Female"],
        stress_level: ["Low", "Medium"],
      },
      ranges: { age: { min: 25, max: 45 } },
    },
  },
  {
    id: "page/no-match",
    source: PART_2,
    what: "A filter nothing matches shows no rows (no one is 74).",
    kind: "page",
    filter: { ranges: { age: { min: 74, max: 74 } } },
  },

  {
    id: "input/hostile-country",
    source: PART_2,
    what: "Quotes and PostgREST syntax in a filter value match nothing and change no data.",
    kind: "input",
    filter: {
      choices: { country: ["Brazil'),or(id.gt.0", "x\"; drop table--"] },
    },
    page: 1,
  },
  {
    id: "input/page-past-end",
    source: PART_2,
    what: "A page number far past the last page says it has no rows.",
    kind: "input",
    filter: {},
    page: 999_999,
  },

  {
    id: "input/page-just-past-end",
    source: PART_2,
    what: "The page right after the last one (page 201 of 200) says it has no rows, instead of showing an empty table.",
    kind: "input",
    filter: {},
    page: 201,
  },

  {
    id: "scale/page-weight",
    source: `${PART_3}, "naive UI patterns"`,
    what: "The page sends one page of rows (at most 200, under 1 MB), not the dataset.",
    kind: "weight",
    maxRows: 200,
    maxBytes: 1_000_000,
  },
  {
    id: "scale/million-rows",
    source: `${PART_3}, "millions of rows"`,
    what: "At 1,000,000 rows, filtered pages stay correct and every response takes under 2 seconds.",
    kind: "scale",
    copies: 100,
    filters: [
      {},
      { choices: { country: ["Brazil"] } },
      { choices: { gender: ["Other"] }, ranges: { age: { min: 60 } } },
      { ranges: { coffee_intake: { min: 2.5, max: 3 } } },
    ],
    maxMs: 2000,
  },
];
