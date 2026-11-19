/**
 * The expected answers, computed from the CSV alone. Nothing here reads the
 * app's code, so a bug in the app's filters cannot also hide in the oracle.
 */

export const CSV_COLUMNS = [
  "ID",
  "Age",
  "Gender",
  "Country",
  "Coffee_Intake",
  "Caffeine_mg",
  "Sleep_Hours",
  "Sleep_Quality",
  "BMI",
  "Heart_Rate",
  "Stress_Level",
  "Physical_Activity_Hours",
  "Health_Issues",
  "Occupation",
  "Smoking",
  "Alcohol_Consumption",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export type CsvRow = Record<CsvColumn, string>;

/** The filters the README names as examples (Part 2). */
export const CHOICE_FILTERS = [
  "country",
  "gender",
  "sleep_quality",
  "stress_level",
] as const;
export const RANGE_FILTERS = ["age", "coffee_intake", "bmi"] as const;

export type ChoiceFilter = (typeof CHOICE_FILTERS)[number];
export type RangeFilter = (typeof RANGE_FILTERS)[number];

/**
 * Values within one filter are alternatives (any of them matches). Different
 * filters must all match. Range bounds are inclusive, and either may be left
 * out.
 */
export type Filter = {
  choices?: Partial<Record<ChoiceFilter, string[]>>;
  ranges?: Partial<Record<RangeFilter, { min?: number; max?: number }>>;
};

const CSV_COLUMN_FOR: Record<ChoiceFilter | RangeFilter, CsvColumn> = {
  country: "Country",
  gender: "Gender",
  sleep_quality: "Sleep_Quality",
  stress_level: "Stress_Level",
  age: "Age",
  coffee_intake: "Coffee_Intake",
  bmi: "BMI",
};

/**
 * Parses the dataset. The file has no quoted fields, so a plain split is
 * exact. Anything unexpected throws instead of producing a wrong oracle.
 */
export function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line !== "");
  const header = lines[0]?.split(",") ?? [];
  if (header.join(",") !== CSV_COLUMNS.join(",")) {
    throw new Error(`Unexpected CSV header: ${lines[0]}`);
  }
  return lines.slice(1).map((line, index) => {
    if (line.includes('"')) {
      throw new Error(`CSV line ${index + 2} has a quoted field`);
    }
    const values = line.split(",");
    if (values.length !== CSV_COLUMNS.length) {
      throw new Error(
        `CSV line ${index + 2} has ${values.length} fields, expected ${CSV_COLUMNS.length}`,
      );
    }
    return Object.fromEntries(
      CSV_COLUMNS.map((column, i) => [column, values[i]]),
    ) as CsvRow;
  });
}

export function matches(row: CsvRow, filter: Filter): boolean {
  for (const [key, values] of Object.entries(filter.choices ?? {})) {
    if (!values || values.length === 0) continue;
    if (!values.includes(row[CSV_COLUMN_FOR[key as ChoiceFilter]])) {
      return false;
    }
  }
  for (const [key, range] of Object.entries(filter.ranges ?? {})) {
    if (!range) continue;
    const value = Number(row[CSV_COLUMN_FOR[key as RangeFilter]]);
    if (range.min !== undefined && value < range.min) return false;
    if (range.max !== undefined && value > range.max) return false;
  }
  return true;
}

/** IDs of the matching rows, in the default order: ID ascending. */
export function expectedIds(rows: CsvRow[], filter: Filter): number[] {
  return rows
    .filter((row) => matches(row, filter))
    .map((row) => Number(row.ID))
    .sort((a, b) => a - b);
}

/**
 * The dataset copied `copies` times, as the scale case builds it in the
 * database: copy k has every ID shifted up by k * rowCount.
 */
export function expectedIdsScaled(
  rows: CsvRow[],
  filter: Filter,
  copies: number,
): number[] {
  const base = expectedIds(rows, filter);
  const ids: number[] = [];
  for (let k = 0; k < copies; k++) {
    for (const id of base) ids.push(id + k * rows.length);
  }
  return ids;
}
