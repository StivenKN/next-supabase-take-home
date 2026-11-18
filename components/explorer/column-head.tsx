"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { fill } from "@/lib/coffee-health/i18n";
import type { SortKey } from "@/lib/coffee-health/schema";
import { cn } from "@/lib/utils";
import { useExplorer } from "./explorer-context";
import { StateLink } from "./state-link";

const ASCENDING_FIRST: SortKey[] = ["id", "country"];

export function ColumnHead({
  column,
  label,
  sortLabel,
  align,
  sortKey,
  className,
}: {
  column: string;
  label: string;
  sortLabel: string;
  align: "left" | "right";
  /** Null when the column has no index to sort by. */
  sortKey: SortKey | null;
  className?: string;
}) {
  const { t, state } = useExplorer();
  const sorted = sortKey !== null && state.sort.column === sortKey;
  const ascending = sorted
    ? !state.sort.ascending
    : sortKey !== null && ASCENDING_FIRST.includes(sortKey);
  const Icon = !sorted
    ? ChevronsUpDown
    : state.sort.ascending
      ? ArrowUp
      : ArrowDown;

  return (
    <th
      scope="col"
      data-column={column}
      aria-sort={
        sorted ? (state.sort.ascending ? "ascending" : "descending") : undefined
      }
      className={cn("type-narrow", className)}
    >
      {sortKey === null ? (
        label
      ) : (
        <StateLink
          state={{ ...state, sort: { column: sortKey, ascending }, page: 1 }}
          title={fill(ascending ? t.sortAscending : t.sortDescending, {
            label: sortLabel,
          })}
          className={cn(
            "-mx-1.5 inline-flex h-7 items-center gap-1 rounded-sm px-1.5 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            align === "right" && "flex-row-reverse",
            sorted && "text-foreground",
          )}
        >
          {label}
          <Icon
            aria-hidden
            className={cn("size-3.5 shrink-0", !sorted && "opacity-70")}
          />
        </StateLink>
      )}
    </th>
  );
}
