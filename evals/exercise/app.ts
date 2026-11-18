import type { CsvColumn, Filter } from "./oracle.ts";

/**
 * How the evals reach the app. This is the only file that knows the table
 * name, the route, or the URL format. When the app changes one of those,
 * change it here, not in the cases.
 *
 * It deliberately does not import the app's own URL code. The evals build
 * URLs independently, so a bug in the app's URL handling shows up as a
 * failing case instead of being shared by both sides.
 */

/** The table that holds the dataset. CSV headers map to lowercase columns. */
export const TABLE = "public.coffee_health";
export const columnFor = (csvHeader: string) => csvHeader.toLowerCase();

/** The page that shows the table. */
export const ROUTE = "/";

/**
 * The header text of the table's ID column. It may go on with text for
 * screen readers, such as "ID, sorted lowest first".
 */
export const ID_HEADER = /^ID\b/;

/**
 * The header of the column that shows each CSV column, for the ones
 * page/row-values compares. Headers may go on with screen-reader text.
 */
export const HEADERS: Partial<Record<CsvColumn, RegExp>> = {
  Age: /^Age\b/,
  Gender: /^Gender\b/,
  Country: /^Country\b/,
  Occupation: /^Occupation\b/,
  Sleep_Quality: /^Sleep quality\b/,
  Stress_Level: /^Stress\b/,
  Health_Issues: /^Health issues\b/,
};

/**
 * Visible text that tells a person a page has no rows: either nothing
 * matches the filters, or the page number is past the last page.
 */
export const NO_ROWS_TEXT = /No one matches these filters|There is no page/;

/**
 * The URL for a filter and page. Rows are expected in ID order, ascending,
 * when no sort is given.
 *
 *   ?country=Brazil,South%20Korea any of these values
 *   &age=30..50                   inclusive bounds, either side optional
 *   &page=3                       1-based
 */
export function urlFor(filter: Filter, page = 1): string {
  const pairs: string[] = [];
  for (const [key, values] of Object.entries(filter.choices ?? {})) {
    if (values && values.length > 0) {
      pairs.push(`${key}=${values.map(encodeURIComponent).join(",")}`);
    }
  }
  for (const [key, range] of Object.entries(filter.ranges ?? {})) {
    if (range && (range.min !== undefined || range.max !== undefined)) {
      pairs.push(`${key}=${range.min ?? ""}..${range.max ?? ""}`);
    }
  }
  if (page !== 1) pairs.push(`page=${page}`);
  return pairs.length > 0 ? `${ROUTE}?${pairs.join("&")}` : ROUTE;
}
