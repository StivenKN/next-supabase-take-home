import { Suspense } from "react";
import {
  LOCALES,
  clearFiltersLabel,
  fill,
  formatNumber,
  getDictionary,
  type Dictionary,
  type Locale,
} from "@/lib/coffee-health/i18n";
import {
  getPage,
  getSummary,
  isMissingSchema,
} from "@/lib/coffee-health/queries";
import {
  DEFAULT_STATE,
  PAGE_SIZE,
  countActiveFilters,
} from "@/lib/coffee-health/schema";
import { parseSearchParams } from "@/lib/coffee-health/search-params";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DataTable } from "./data-table";
import { ExplorerProvider } from "./explorer-context";
import { FilterBar } from "./filter-bar";
import { FILTER_GRID } from "./filter-grid";
import { LocaleLinks, LocaleSwitch } from "./locale-switch";
import { TableFooter } from "./pagination";
import { MATCH_COUNT_ID, StateLink } from "./state-link";
import { StatusPanel } from "./status-panel";
import { TableViewport } from "./table-viewport";
import { ThemeToggle } from "./theme-toggle";

export type RawSearchParams = Record<string, string | string[] | undefined>;

// With cacheComponents, reading searchParams or the database outside
// <Suspense> fails the build. The title bar is the static shell and everything
// else streams in behind it.
export function ExplorerPage({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Promise<RawSearchParams>;
}) {
  const t = getDictionary(locale);
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-4 border-b bg-card px-4 py-2.5">
        <h1 className="type-wide whitespace-nowrap text-base font-bold leading-tight tracking-tight sm:text-lg">
          {t.title}
        </h1>
        <p className="hidden min-w-0 flex-1 truncate text-[13px] text-muted-foreground md:block">
          {t.tagline}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Suspense
            fallback={<LocaleLinks current={locale} label={t.language} />}
          >
            <LocaleSwitch current={locale} label={t.language} />
          </Suspense>
          <ThemeToggle label={t.toggleTheme} />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<ExplorerSkeleton label={t.loading} />}>
          <Explorer locale={locale} searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function Explorer({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Promise<RawSearchParams>;
}) {
  const t = getDictionary(locale);
  const state = parseSearchParams(await searchParams);

  const [summary, page] = await Promise.all([
    getSummary().catch(() => null),
    getPage(state),
  ]);

  if (page.status === "error") {
    return <NotReady t={t} missingSchema={isMissingSchema(page.code)} />;
  }
  // The table answered, so a failed summary means the table is empty or the
  // summary function is missing. `pnpm db:reset` fixes both. The summary can
  // be up to a minute old, so an unfiltered count of zero is the reliable sign
  // of an empty table.
  const tableIsEmpty = page.count === 0 && countActiveFilters(state) === 0;
  if (summary === null || tableIsEmpty) return <NotReady t={t} missingSchema />;

  const lastPage = Math.max(1, Math.ceil(page.count / PAGE_SIZE));

  return (
    <ExplorerProvider
      locale={locale}
      dictionary={t}
      pathname={LOCALES[locale].path}
      state={state}
    >
      <FilterBar summary={summary} count={page.count} />
      {page.count === 0 ? (
        <StatusPanel title={t.emptyTitle} body={t.emptyBody}>
          <PanelLink state={{ ...DEFAULT_STATE, sort: state.sort }}>
            {clearFiltersLabel(t, countActiveFilters(state))}
          </PanelLink>
        </StatusPanel>
      ) : page.status === "out-of-range" ? (
        <StatusPanel
          title={fill(t.outOfRangeTitle, {
            page: formatNumber(locale, state.page),
          })}
          body={fill(t.outOfRangeBody, {
            last: formatNumber(locale, lastPage),
          })}
        >
          <PanelLink state={{ ...state, page: 1 }}>{t.firstPage}</PanelLink>
        </StatusPanel>
      ) : (
        <>
          <TableViewport>
            <DataTable
              rows={page.rows}
              locale={locale}
              dictionary={t}
              maxCoffee={summary.ranges.coffee_intake[1] ?? 0}
              maxSleep={summary.ranges.sleep_hours[1] ?? 0}
            />
          </TableViewport>
          <TableFooter count={page.count} page={state.page} />
        </>
      )}
    </ExplorerProvider>
  );
}

function NotReady({
  t,
  missingSchema,
}: {
  t: Dictionary;
  missingSchema: boolean;
}) {
  return missingSchema ? (
    <StatusPanel
      title={t.setupTitle}
      body={t.setupBody}
      command="pnpm db:reset"
    />
  ) : (
    <StatusPanel
      title={t.unreachableTitle}
      body={t.unreachableBody}
      command="pnpm setup:env"
    />
  );
}

function PanelLink(props: React.ComponentProps<typeof StateLink>) {
  return (
    <Button
      asChild
      className="focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
    >
      <StateLink moveFocusTo={MATCH_COUNT_ID} {...props} />
    </Button>
  );
}

// Keep these heights equal to the real layout's, or the page jumps when the
// data replaces the skeleton.
function ExplorerSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex min-h-0 flex-1 flex-col motion-safe:animate-pulse"
    >
      <div className="grid gap-x-6 gap-y-2 border-b px-4 py-2.5 xl:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="flex h-5 items-center xl:h-auto xl:items-start xl:py-2">
          <div className="h-3 w-28 rounded-full bg-muted" />
        </div>
        <div className={cn(FILTER_GRID, "overflow-x-hidden")}>
          {Array.from({ length: 12 }, (_, index) => (
            <div
              key={index}
              className="h-8 w-28 shrink-0 rounded-md bg-muted md:w-auto"
            />
          ))}
        </div>
      </div>
      <div className="skeleton-rows min-h-0 flex-1 bg-card" />
      <div className="flex h-12 items-center justify-between border-t px-4">
        <div className="h-3 w-24 rounded-full bg-muted" />
        <div className="h-3 w-40 rounded-full bg-muted" />
      </div>
    </div>
  );
}
