"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { fill, formatNumber } from "@/lib/coffee-health/i18n";
import { PAGE_SIZE } from "@/lib/coffee-health/schema";
import { pageWindow } from "@/lib/coffee-health/search-params";
import { cn } from "@/lib/utils";
import { useExplorer } from "./explorer-context";
import { StateLink } from "./state-link";

const STEP =
  "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-[13px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TableFooter({ count, page }: { count: number; page: number }) {
  const { t, locale, state } = useExplorer();
  const last = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, count);
  const number = (value: number) => formatNumber(locale, value);
  const pages = pageWindow(page, last);

  const step = (target: number, label: string, icon: React.ReactNode) => {
    const disabled = target < 1 || target > last;
    return (
      <StateLink
        state={{ ...state, page: target }}
        disabled={disabled}
        rel={target < page ? "prev" : "next"}
        className={cn(
          STEP,
          disabled
            ? "cursor-default text-muted-foreground/70"
            : "hover:bg-accent",
        )}
      >
        {icon}
        <span className="sr-only sm:not-sr-only">{label}</span>
      </StateLink>
    );
  };

  return (
    <footer className="flex items-center justify-between gap-4 border-t bg-background px-4 py-2">
      <p className="text-[13px] tabular-nums text-muted-foreground">
        {count > 0 && fill(t.rowsRange, { from: number(from), to: number(to) })}
      </p>
      <nav aria-label={t.pagination} className="flex items-center gap-1">
        {step(
          page - 1,
          t.previous,
          <ChevronLeft aria-hidden className="size-4" />,
        )}
        <p className="px-1 text-[13px] tabular-nums text-muted-foreground md:hidden">
          {fill(t.pageOf, { page: number(page), last: number(last) })}
        </p>
        <ol className="hidden items-center gap-1 md:flex">
          {pages.map((target, index) =>
            target === null ? (
              <li
                key={`gap-before-${pages[index + 1]}`}
                aria-hidden
                className="w-6 text-center text-muted-foreground"
              >
                …
              </li>
            ) : (
              <li key={target}>
                <StateLink
                  state={{ ...state, page: target }}
                  aria-label={fill(t.page, { page: number(target) })}
                  aria-current={target === page ? "page" : undefined}
                  className={cn(
                    STEP,
                    target === page
                      ? // An ink ring on an ink button needs a gap to show.
                        "bg-primary font-semibold text-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      : "hover:bg-accent",
                  )}
                >
                  {number(target)}
                </StateLink>
              </li>
            ),
          )}
        </ol>
        <span className="contents [&>*]:flex-row-reverse">
          {step(
            page + 1,
            t.next,
            <ChevronRight aria-hidden className="size-4" />,
          )}
        </span>
      </nav>
    </footer>
  );
}
