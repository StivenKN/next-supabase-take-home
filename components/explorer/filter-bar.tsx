"use client";

import { forwardRef, useId, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clearFiltersLabel,
  fill,
  formatNumber,
  valueLabel,
} from "@/lib/coffee-health/i18n";
import {
  CHOICE_KEYS,
  DEFAULT_STATE,
  ENUM_OPTIONS,
  FLAG_KEYS,
  RANGE_KEYS,
  RANGE_STEPS,
  countActiveFilters,
  type ChoiceKey,
  type ExplorerState,
  type FlagKey,
  type Range,
  type RangeKey,
  type Summary,
} from "@/lib/coffee-health/schema";
import { cn } from "@/lib/utils";
import { useExplorer } from "./explorer-context";
import { FILTER_GRID } from "./filter-grid";
import { MATCH_COUNT_ID, StateLink } from "./state-link";

export function FilterBar({
  summary,
  count,
}: {
  summary: Summary;
  count: number;
}) {
  const { t, locale, state, renderedState, isPending } = useExplorer();
  const activeFilters = countActiveFilters(state);

  // The count describes the rows on screen, so its wording follows the view
  // the server rendered, not the one still loading.
  const total = formatNumber(locale, summary.total);
  const matchText =
    countActiveFilters(renderedState) > 0
      ? fill(t.matchOfTotal, { count: formatNumber(locale, count), total })
      : fill(summary.total === 1 ? t.matchOne : t.matchMany, { count: total });

  return (
    <section
      aria-label={t.filtersLabel}
      className="grid gap-x-6 gap-y-2 border-b bg-background px-4 py-2.5 xl:grid-cols-[12rem_minmax(0,1fr)]"
    >
      {/* The count comes first and sits beside the filters on wide screens,
          so an open menu never covers the number it is changing. */}
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 xl:flex-col xl:gap-y-1 xl:py-1">
        <p
          id={MATCH_COUNT_ID}
          tabIndex={-1}
          aria-live="polite"
          className={cn(
            "rounded-sm text-[13px] font-semibold tabular-nums outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isPending && "opacity-50",
          )}
        >
          {matchText}
        </p>
        {activeFilters > 0 && (
          <StateLink
            state={{ ...DEFAULT_STATE, sort: state.sort }}
            moveFocusTo={MATCH_COUNT_ID}
            className="rounded-sm text-[13px] underline underline-offset-4 outline-none hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {/* On a phone most set filters are off-screen, so say how many there are. */}
            {clearFiltersLabel(t, activeFilters)}
          </StateLink>
        )}
      </div>

      {/* A fixed grid from md up: a filter keeps its cell whatever it is set
          to, so setting one never moves the table. The column counts leave
          room for the longest Spanish label and value. Below md the row
          scrolls sideways, and its padding keeps focus rings from being
          clipped. */}
      <div className={FILTER_GRID}>
        {CHOICE_KEYS.map((key) => (
          <ChoiceFilter
            key={key}
            filter={key}
            options={key === "country" ? summary.countries : ENUM_OPTIONS[key]}
          />
        ))}
        {RANGE_KEYS.map((key) => (
          <RangeFilter key={key} filter={key} bounds={summary.ranges[key]} />
        ))}
        {FLAG_KEYS.map((key) => (
          <FlagFilter key={key} filter={key} />
        ))}
      </div>
    </section>
  );
}

/** Changing any filter returns to the first page: page 7 of the old result means nothing in the new one. */
function withFilters(
  state: ExplorerState,
  patch: Partial<Pick<ExplorerState, "choices" | "ranges" | "flags">>,
): ExplorerState {
  return { ...state, ...patch, page: 1 };
}

function FilterFrame({
  active,
  clearLabel,
  onClear,
  children,
}: {
  active: boolean;
  clearLabel: string;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-8 min-w-0 shrink-0 items-stretch rounded-md border text-[13px]",
        active
          ? "border-primary/50 bg-primary/[0.07] text-foreground"
          : "border-input bg-card text-foreground",
      )}
    >
      {children}
      {active && (
        <button
          type="button"
          aria-label={clearLabel}
          title={clearLabel}
          onClick={(event) => {
            // This button is about to disappear. Hand focus to the filter's
            // own button first so the keyboard stays where it was.
            event.currentTarget.parentElement?.querySelector("button")?.focus();
            onClear();
          }}
          className="flex w-7 shrink-0 items-center justify-center rounded-r-[5px] outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      )}
    </div>
  );
}

const FilterButton = forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentProps<"button">, "value"> & {
    label: string;
    value: string | null;
  }
>(function FilterButton({ label, value, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      title={value === null ? undefined : `${label}: ${value}`}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap rounded-[5px] pl-2.5 pr-2 outline-none hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate">{label}</span>
      {value !== null && (
        <span className="max-w-40 shrink-0 truncate font-semibold tabular-nums md:max-w-[70%]">
          {value}
        </span>
      )}
      {/* A set filter gives the arrow's room to its value. The clear button
          beside it already marks it as a control. */}
      {value === null && (
        <ChevronDown
          aria-hidden
          className="ml-auto size-3.5 shrink-0 opacity-70"
        />
      )}
    </button>
  );
});

function ChoiceFilter({
  filter,
  options,
}: {
  filter: ChoiceKey;
  options: readonly string[];
}) {
  const { t, locale, state, navigate } = useExplorer();
  const selected = state.choices[filter];
  const label = t.filters[filter];

  // Enum options keep their meaningful order (Poor before Good). Countries
  // sort by the name the reader sees, so "Alemania" leads the Spanish list.
  const items = options.map((value) => ({
    value,
    label: valueLabel(t, value, filter),
  }));
  if (filter === "country") {
    items.sort((a, b) => a.label.localeCompare(b.label, locale));
  }
  // A country from a shared link may no longer be in the data. Keep it in the
  // list so it can be unticked.
  for (const value of selected) {
    if (!options.includes(value)) items.push({ value, label: value });
  }

  const setSelected = (values: string[]) =>
    navigate(
      withFilters(state, { choices: { ...state.choices, [filter]: values } }),
    );

  const [firstSelected] = selected;
  const value =
    firstSelected === undefined
      ? null
      : valueLabel(t, firstSelected, filter) +
        (selected.length > 1 ? ` +${selected.length - 1}` : "");

  return (
    <FilterFrame
      active={selected.length > 0}
      clearLabel={fill(t.clearFilter, { label })}
      onClear={() => setSelected([])}
    >
      {/* Not modal: a click on another filter should open it, not just close this one. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <FilterButton label={label} value={value} />
        </DropdownMenuTrigger>
        {/* The height ends halfway through a row, which shows the list goes on. */}
        <DropdownMenuContent
          align="start"
          className="max-h-[19.25rem] min-w-44"
        >
          {items.map((item) => (
            <DropdownMenuCheckboxItem
              key={item.value}
              checked={selected.includes(item.value)}
              // Keep the menu open so several values can be ticked in one go.
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                setSelected(
                  checked
                    ? [...selected, item.value]
                    : selected.filter((value) => value !== item.value),
                )
              }
              className="text-[13px]"
            >
              {item.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </FilterFrame>
  );
}

function FlagFilter({ filter }: { filter: FlagKey }) {
  const { t, state, navigate } = useExplorer();
  const flag = state.flags[filter];
  const label = t.filters[filter];

  const setFlag = (next: boolean | null) =>
    navigate(withFilters(state, { flags: { ...state.flags, [filter]: next } }));

  return (
    <FilterFrame
      active={flag !== null}
      clearLabel={fill(t.clearFilter, { label })}
      onClear={() => setFlag(null)}
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <FilterButton
            label={label}
            value={flag === null ? null : flag ? t.yes : t.no}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup
            value={flag === null ? "any" : flag ? "yes" : "no"}
            onValueChange={(value) =>
              setFlag(value === "any" ? null : value === "yes")
            }
          >
            <DropdownMenuRadioItem value="any" className="text-[13px]">
              {t.any}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="yes" className="text-[13px]">
              {t.yes}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="no" className="text-[13px]">
              {t.no}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </FilterFrame>
  );
}

const PANEL_WIDTH = 248;
const TYPING_PAUSE_MS = 350;

function RangeFilter({
  filter,
  bounds,
}: {
  filter: RangeKey;
  bounds: [number | null, number | null];
}) {
  const { t, locale, state, navigate } = useExplorer();
  const range = state.ranges[filter];
  const label = t.filters[filter];
  const digits = RANGE_STEPS[filter] === 1 ? 0 : 1;
  const active = range.min !== null || range.max !== null;

  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const setRange = (next: Range, options?: { replace?: boolean }) =>
    navigate(
      withFilters(state, { ranges: { ...state.ranges, [filter]: next } }),
      options,
    );

  // A typed range is applied once typing pauses, or at once when the panel
  // closes. `visit` tracks one stay in the open panel.
  const visit = useRef<{
    applied: Range;
    pending: Range | null;
    timer: ReturnType<typeof setTimeout> | undefined;
    hasApplied: boolean;
  }>({ applied: range, pending: null, timer: undefined, hasApplied: false });

  const applyPending = () => {
    const current = visit.current;
    clearTimeout(current.timer);
    const next = current.pending;
    current.pending = null;
    if (
      next === null ||
      (next.min === current.applied.min && next.max === current.applied.max)
    ) {
      return;
    }
    // The first change in a visit adds a history entry, so Back returns to
    // the view from before the panel opened. Later changes replace that entry
    // instead of stacking one per keystroke.
    setRange(next, { replace: current.hasApplied });
    current.applied = next;
    current.hasApplied = true;
  };

  const editRange = (next: Range) => {
    const current = visit.current;
    current.pending = next;
    clearTimeout(current.timer);
    current.timer = setTimeout(applyPending, TYPING_PAUSE_MS);
  };

  // The panel is a native popover: the browser puts it above everything else,
  // closes it on Escape or an outside click, and returns focus to the button.
  // Placing it under its button is the one thing left to do by hand.
  const placePanel = () => {
    const button = buttonRef.current;
    const panel = panelRef.current;
    if (!button || !panel) return;
    const rect = button.getBoundingClientRect();
    const left = Math.min(
      Math.max(rect.left, 8),
      window.innerWidth - PANEL_WIDTH - 8,
    );
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.left = `${Math.max(left, 8)}px`;
  };

  // The panel does not follow its button, so it closes when the button moves:
  // on a resize, or when something that contains the button scrolls. The
  // table scrolling back to its top after a filter change is not that.
  const closeOnMove = useRef<AbortController | null>(null);
  const watchForMove = () => {
    const controller = new AbortController();
    closeOnMove.current = controller;
    const { signal } = controller;
    const close = () => panelRef.current?.hidePopover();
    window.addEventListener("resize", close, { signal });
    window.addEventListener(
      "scroll",
      (event) => {
        const scrolled = event.target;
        if (scrolled instanceof Node && scrolled.contains(buttonRef.current)) {
          close();
        }
      },
      { signal, capture: true },
    );
  };

  const format = (value: number) => formatNumber(locale, value, digits);
  const value = !active
    ? null
    : range.min !== null && range.max !== null
      ? fill(t.between, { min: format(range.min), max: format(range.max) })
      : range.min !== null
        ? fill(t.atLeast, { min: format(range.min) })
        : fill(t.atMost, { max: format(range.max!) });

  return (
    <FilterFrame
      active={active}
      clearLabel={fill(t.clearFilter, { label })}
      onClear={() => setRange({ min: null, max: null })}
    >
      <FilterButton
        ref={buttonRef}
        label={label}
        value={value}
        popoverTarget={panelId}
      />
      <div
        ref={panelRef}
        id={panelId}
        popover="auto"
        onBeforeToggle={(event) => {
          if (event.newState === "open") placePanel();
        }}
        onToggle={(event) => {
          if (event.newState === "open") {
            visit.current = {
              applied: range,
              pending: null,
              timer: undefined,
              hasApplied: false,
            };
            watchForMove();
            setOpen(true);
          } else {
            closeOnMove.current?.abort();
            applyPending();
            setOpen(false);
          }
        }}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && !event.currentTarget.contains(next)) {
            event.currentTarget.hidePopover();
          }
        }}
        role="group"
        aria-label={label}
        style={{ width: PANEL_WIDTH }}
        className="fixed rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
      >
        {/* Mounted only while open, so the fields start from the current filter each time. */}
        {open && (
          <RangeFields
            label={label}
            range={range}
            bounds={bounds}
            step={RANGE_STEPS[filter]}
            onEdit={editRange}
            onDone={() => panelRef.current?.hidePopover()}
          />
        )}
      </div>
    </FilterFrame>
  );
}

function parseBound(text: string, step: number): number | null {
  if (text.trim() === "") return null;
  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return null;
  const rounded = step === 1 ? Math.round(value) : Math.round(value * 10) / 10;
  // The URL parser accepts at most four digits before the decimal point.
  return rounded > 9999 ? null : rounded;
}

function RangeFields({
  label,
  range,
  bounds,
  step,
  onEdit,
  onDone,
}: {
  label: string;
  range: Range;
  bounds: [number | null, number | null];
  step: number;
  onEdit: (range: Range) => void;
  onDone: () => void;
}) {
  const { t, locale } = useExplorer();
  const minId = useId();
  const maxId = useId();
  const hintId = useId();
  const [draft, setDraft] = useState({
    min: range.min?.toString() ?? "",
    max: range.max?.toString() ?? "",
  });

  const min = parseBound(draft.min, step);
  const max = parseBound(draft.max, step);
  const inverted = min !== null && max !== null && min > max;
  const [lowest, highest] = bounds;
  const digits = step === 1 ? 0 : 1;

  const field = (side: "min" | "max", id: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        <span aria-hidden>{side === "min" ? t.min : t.max}</span>
        <span className="sr-only">
          {fill(side === "min" ? t.minOf : t.maxOf, { label })}
        </span>
      </Label>
      <Input
        id={id}
        type="number"
        inputMode={step === 1 ? "numeric" : "decimal"}
        min={0}
        step={step}
        autoFocus={side === "min"}
        value={draft[side]}
        aria-invalid={inverted || undefined}
        aria-describedby={inverted ? hintId : undefined}
        onChange={(event) => {
          const next = { ...draft, [side]: event.target.value };
          setDraft(next);
          onEdit({
            min: parseBound(next.min, step),
            max: parseBound(next.max, step),
          });
        }}
        // Show what was applied: "6.55" becomes "6.6", the value in the URL.
        onBlur={() => {
          const applied = parseBound(draft[side], step);
          setDraft({ ...draft, [side]: applied?.toString() ?? "" });
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          // Closing hands focus back to the filter button. Without this the
          // same key press would reach that button and open the panel again.
          event.preventDefault();
          onDone();
        }}
        className="h-8 bg-background tabular-nums md:text-[13px]"
      />
    </div>
  );

  return (
    <div className="grid gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        {field("min", minId)}
        {field("max", maxId)}
      </div>
      {inverted ? (
        <p id={hintId} role="alert" className="text-xs text-destructive">
          {t.rangeInverted}
        </p>
      ) : (
        lowest !== null &&
        highest !== null && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {fill(t.rangeInData, {
              min: formatNumber(locale, lowest, digits),
              max: formatNumber(locale, highest, digits),
            })}
          </p>
        )
      )}
    </div>
  );
}
