import { createClient } from "@supabase/supabase-js";
import { cacheLife } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import {
  CHOICE_KEYS,
  COLUMNS,
  FLAG_KEYS,
  PAGE_SIZE,
  RANGE_KEYS,
  type CoffeeHealthRow,
  type ExplorerState,
  type Summary,
} from "./schema";

// The dataset is public and nobody signs in, so reads use the publishable key
// without the cookie-based session client in lib/supabase/server.ts. Reading
// cookies would also make every request uncacheable.
function publicClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Total row count, country list, and numeric bounds: everything the filter bar
 * needs that does not depend on the current filters.
 *
 * It throws when the call fails or the table is empty, because "use cache"
 * does not store a thrown result. A cached "empty" answer would keep the
 * "dataset is not loaded" panel on screen after the CSV is loaded.
 */
export async function getSummary(): Promise<Summary> {
  "use cache";
  cacheLife("minutes");
  const { data, error } = await publicClient().rpc("coffee_health_summary");
  if (error) throw new Error(error.message);
  const summary = data as Summary;
  if (summary.total === 0) throw new Error("coffee_health is empty");
  return summary;
}

export type PageResult =
  | { status: "ok"; rows: CoffeeHealthRow[]; count: number }
  /** The requested page starts after the last matching row. */
  | { status: "out-of-range"; count: number }
  | { status: "error"; code: string | undefined };

function matching(
  state: ExplorerState,
  columns: string,
  options: { count: "exact"; head?: boolean },
) {
  let query = publicClient().from("coffee_health").select(columns, options);
  for (const key of CHOICE_KEYS) {
    const values = state.choices[key];
    if (values.length > 0) query = query.in(key, values);
  }
  for (const key of RANGE_KEYS) {
    const { min, max } = state.ranges[key];
    if (min !== null) query = query.gte(key, min);
    if (max !== null) query = query.lte(key, max);
  }
  for (const key of FLAG_KEYS) {
    const flag = state.flags[key];
    if (flag !== null) query = query.eq(key, flag);
  }
  return query;
}

/** One page of rows plus the number of rows that match the filters. */
export async function getPage(state: ExplorerState): Promise<PageResult> {
  try {
    let query = matching(state, COLUMNS.join(","), { count: "exact" });

    const { column, ascending } = state.sort;
    query = query.order(column, { ascending });
    // Many rows share the same age or country. Without a unique tiebreaker
    // their order can change between requests, and a row can land on two pages
    // or on none. The tiebreaker points the same way as the main sort so
    // Postgres can read the (column, id) index in either direction.
    if (column !== "id") query = query.order("id", { ascending });

    const from = (state.page - 1) * PAGE_SIZE;
    const { data, count, error } = await query
      .range(from, from + PAGE_SIZE - 1)
      .overrideTypes<CoffeeHealthRow[], { merge: false }>();

    if (!error) {
      const total = count ?? 0;
      // An offset equal to the row count is not an error for PostgREST. It
      // answers with no rows, so the page right after the last one lands here.
      if (data.length === 0 && total > 0) {
        return { status: "out-of-range", count: total };
      }
      return { status: "ok", rows: data, count: total };
    }
    // PostgREST rejects an offset greater than the row count with PGRST103 and
    // sends no count. The page still has to say how many rows match.
    if (error.code === "PGRST103") {
      const total = await matching(state, "id", { count: "exact", head: true });
      if (!total.error)
        return { status: "out-of-range", count: total.count ?? 0 };
      return { status: "error", code: total.error.code };
    }
    return { status: "error", code: error.code };
  } catch {
    // createClient throws when .env.local is missing, and fetch throws when
    // nothing listens on the Supabase port.
    return { status: "error", code: undefined };
  }
}

/** True when the failure means "the migration has not run", not "the database is down". */
export function isMissingSchema(code: string | undefined): boolean {
  return (
    code === "PGRST205" || // table not in the API schema cache
    code === "42P01" // undefined_table
  );
}
