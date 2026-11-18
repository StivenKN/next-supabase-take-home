import {
  CHOICE_KEYS,
  DEFAULT_STATE,
  ENUM_OPTIONS,
  FLAG_KEYS,
  RANGE_KEYS,
  RANGE_STEPS,
  SORT_KEYS,
  type ChoiceKey,
  type EnumKey,
  type ExplorerState,
  type Range,
  type RangeKey,
  type SortKey,
} from "./schema";

/**
 * The URL is the only place filter, sort, and page state lives. That makes
 * every view a link someone can share, and it lets the server render the page
 * without any client state.
 *
 *   ?country=Brazil,Germany   any of these values
 *   &age=30..50               minimum and maximum, either side optional
 *   &smoking=yes              yes or no
 *   &sort=-caffeine_mg        leading minus sorts descending
 *   &page=3
 *
 * Parsing never throws. Anything it does not understand is dropped, so a
 * mistyped URL shows a wider result instead of an error.
 */

type RawParams = Record<string, string | string[] | undefined>;

const MAX_CHOICES = 50;
const MAX_VALUE_LENGTH = 60;
const MAX_PAGE = 1_000_000;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isEnumKey(key: ChoiceKey): key is EnumKey {
  return key in ENUM_OPTIONS;
}

function parseChoices(key: ChoiceKey, raw: string | undefined): string[] {
  if (!raw) return [];
  const values = [
    ...new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  if (isEnumKey(key)) {
    // Keep the enum's own order so the same selection always gives one URL.
    const options: readonly string[] = ENUM_OPTIONS[key];
    return options.filter((option) => values.includes(option));
  }
  // Country is free text. Quotes and backslashes cannot be escaped inside a
  // PostgREST in.(...) list, and no country name contains them.
  return values
    .filter((value) => value.length <= MAX_VALUE_LENGTH && !/["\\]/.test(value))
    .slice(0, MAX_CHOICES)
    .sort((a, b) => a.localeCompare(b, "en"));
}

function parseBound(key: RangeKey, raw: string): number | null {
  if (!/^\d{1,4}(\.\d)?$/.test(raw)) return null;
  const value = Number(raw);
  return RANGE_STEPS[key] === 1 ? Math.round(value) : value;
}

function parseRange(key: RangeKey, raw: string | undefined): Range {
  if (!raw) return { min: null, max: null };
  const [min, max, ...rest] = raw.split("..");
  if (min === undefined || max === undefined || rest.length > 0) {
    return { min: null, max: null };
  }
  return { min: parseBound(key, min), max: parseBound(key, max) };
}

function parseSort(raw: string | undefined): ExplorerState["sort"] {
  if (!raw) return DEFAULT_STATE.sort;
  const ascending = !raw.startsWith("-");
  const column = ascending ? raw : raw.slice(1);
  if (!(SORT_KEYS as readonly string[]).includes(column)) {
    return DEFAULT_STATE.sort;
  }
  return { column: column as SortKey, ascending };
}

function parsePage(raw: string | undefined): number {
  if (!raw || !/^\d{1,7}$/.test(raw)) return 1;
  return Math.min(Math.max(Number(raw), 1), MAX_PAGE);
}

export function parseSearchParams(params: RawParams): ExplorerState {
  const choices = {} as ExplorerState["choices"];
  for (const key of CHOICE_KEYS) {
    choices[key] = parseChoices(key, first(params[key]));
  }
  const ranges = {} as ExplorerState["ranges"];
  for (const key of RANGE_KEYS) {
    ranges[key] = parseRange(key, first(params[key]));
  }
  const flags = {} as ExplorerState["flags"];
  for (const key of FLAG_KEYS) {
    const raw = first(params[key]);
    flags[key] = raw === "yes" ? true : raw === "no" ? false : null;
  }
  return {
    choices,
    ranges,
    flags,
    sort: parseSort(first(params.sort)),
    page: parsePage(first(params.page)),
  };
}

export function serializeState(state: ExplorerState): string {
  const pairs: string[] = [];
  const encode = (value: string) =>
    encodeURIComponent(value).replace(/%2C/g, ",").replace(/%20/g, "+");

  for (const key of CHOICE_KEYS) {
    if (state.choices[key].length > 0) {
      pairs.push(`${key}=${state.choices[key].map(encode).join(",")}`);
    }
  }
  for (const key of RANGE_KEYS) {
    const { min, max } = state.ranges[key];
    if (min !== null || max !== null) {
      pairs.push(`${key}=${min ?? ""}..${max ?? ""}`);
    }
  }
  for (const key of FLAG_KEYS) {
    const flag = state.flags[key];
    if (flag !== null) pairs.push(`${key}=${flag ? "yes" : "no"}`);
  }
  const { column, ascending } = state.sort;
  if (column !== DEFAULT_STATE.sort.column || !ascending) {
    pairs.push(`sort=${ascending ? "" : "-"}${column}`);
  }
  if (state.page > 1) pairs.push(`page=${state.page}`);
  return pairs.join("&");
}

export function hrefForState(pathname: string, state: ExplorerState): string {
  const query = serializeState(state);
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Page numbers to show: the first, the last, and the pages around the current
 * one. A null marks a gap. pageWindow(6, 20) gives [1, null, 5, 6, 7, null, 20].
 */
export function pageWindow(current: number, last: number): (number | null)[] {
  const wanted = new Set([1, last, current - 1, current, current + 1]);
  // A gap that hides a single page is longer than the page number it hides.
  if (current - 1 === 3) wanted.add(2);
  if (last - current === 3) wanted.add(last - 1);
  const pages = [...wanted]
    .filter((page) => page >= 1 && page <= last)
    .sort((a, b) => a - b);
  const result: (number | null)[] = [];
  for (const page of pages) {
    const previous = result[result.length - 1];
    if (typeof previous === "number" && page - previous > 1) result.push(null);
    result.push(page);
  }
  return result;
}
