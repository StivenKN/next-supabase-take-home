import type { Database } from "@/lib/supabase/database.types";
import { Constants } from "@/lib/supabase/database.types";

export type CoffeeHealthRow =
  Database["public"]["Tables"]["coffee_health"]["Row"];

export const PAGE_SIZE = 50;

export const COLUMNS = [
  "id",
  "age",
  "gender",
  "country",
  "occupation",
  "caffeine_mg",
  "coffee_intake",
  "sleep_hours",
  "sleep_quality",
  "stress_level",
  "heart_rate",
  "bmi",
  "physical_activity_hours",
  "health_issues",
  "smoking",
  "alcohol_consumption",
] as const satisfies readonly (keyof CoffeeHealthRow)[];

export type ColumnKey = (typeof COLUMNS)[number];

/**
 * Filters where the user picks any number of values. The enum-backed ones take
 * their options from the generated database types, so a new enum value in a
 * migration reaches the filter bar after `supabase gen types`. Country is free
 * text in the database, so its options come from the data at runtime.
 */
export const ENUM_OPTIONS = {
  gender: Constants.public.Enums.gender,
  occupation: Constants.public.Enums.occupation,
  sleep_quality: Constants.public.Enums.sleep_quality,
  stress_level: Constants.public.Enums.stress_level,
  health_issues: Constants.public.Enums.health_issues,
} as const;

export type EnumKey = keyof typeof ENUM_OPTIONS;

export const CHOICE_KEYS = [
  "country",
  "gender",
  "occupation",
  "sleep_quality",
  "stress_level",
  "health_issues",
] as const satisfies readonly ColumnKey[];
export type ChoiceKey = (typeof CHOICE_KEYS)[number];

export const RANGE_STEPS = {
  age: 1,
  coffee_intake: 0.1,
  sleep_hours: 0.1,
  bmi: 0.1,
} as const satisfies Partial<Record<ColumnKey, number>>;
export const RANGE_KEYS = Object.keys(RANGE_STEPS) as RangeKey[];
export type RangeKey = keyof typeof RANGE_STEPS;

export const FLAG_KEYS = [
  "smoking",
  "alcohol_consumption",
] as const satisfies readonly ColumnKey[];
export type FlagKey = (typeof FLAG_KEYS)[number];

/**
 * Only columns with a (column, id) index are sortable, so every sort reads the
 * first page straight from an index. See supabase/schemas/coffee_health.sql.
 */
export const SORT_KEYS = [
  "id",
  "age",
  "country",
  "caffeine_mg",
  "coffee_intake",
  "sleep_hours",
  "heart_rate",
  "bmi",
] as const satisfies readonly ColumnKey[];
export type SortKey = (typeof SORT_KEYS)[number];

export type Range = { min: number | null; max: number | null };

export type ExplorerState = {
  choices: Record<ChoiceKey, string[]>;
  ranges: Record<RangeKey, Range>;
  flags: Record<FlagKey, boolean | null>;
  sort: { column: SortKey; ascending: boolean };
  page: number;
};

export const DEFAULT_STATE: ExplorerState = {
  choices: {
    country: [],
    gender: [],
    occupation: [],
    sleep_quality: [],
    stress_level: [],
    health_issues: [],
  },
  ranges: {
    age: { min: null, max: null },
    coffee_intake: { min: null, max: null },
    sleep_hours: { min: null, max: null },
    bmi: { min: null, max: null },
  },
  flags: { smoking: null, alcohol_consumption: null },
  sort: { column: "id", ascending: true },
  page: 1,
};

export function countActiveFilters(state: ExplorerState): number {
  return (
    CHOICE_KEYS.filter((key) => state.choices[key].length > 0).length +
    RANGE_KEYS.filter(
      (key) => state.ranges[key].min !== null || state.ranges[key].max !== null,
    ).length +
    FLAG_KEYS.filter((key) => state.flags[key] !== null).length
  );
}

export type Summary = {
  total: number;
  countries: string[];
  ranges: Record<RangeKey, [number | null, number | null]>;
};
