import {
  formatNumber,
  valueLabel,
  type Dictionary,
  type Locale,
} from "@/lib/coffee-health/i18n";
import {
  COLUMNS,
  ENUM_OPTIONS,
  SORT_KEYS,
  type CoffeeHealthRow,
  type ColumnKey,
  type SortKey,
} from "@/lib/coffee-health/schema";
import { ColumnHead } from "./column-head";

const DIGITS: Partial<Record<ColumnKey, number>> = {
  id: 0,
  age: 0,
  caffeine_mg: 1,
  coffee_intake: 1,
  sleep_hours: 1,
  heart_rate: 0,
  bmi: 1,
  physical_activity_hours: 1,
};

// Sleep's bar grows to the right of the line it shares with coffee, so its
// number sits on the far side of the bar.
const ALIGN_LEFT_NUMBERS: ColumnKey[] = ["sleep_hours"];

function alignment(column: ColumnKey): "left" | "right" {
  return column in DIGITS && !ALIGN_LEFT_NUMBERS.includes(column)
    ? "right"
    : "left";
}

/*
 * Fifty rows of sixteen cells is eight hundred cells. Each one is a plain
 * server-rendered <td> with at most one short class name, styled by the
 * .data-table rules in globals.css. Long utility class lists on every cell,
 * or a client component per cell, made the page about ten times heavier.
 */
const CELL_CLASS: Partial<Record<ColumnKey, string>> = {
  id: "id",
  coffee_intake: "num coffee",
  sleep_hours: "sleep",
};

function cellClass(column: ColumnKey): string | undefined {
  return (
    CELL_CLASS[column] ?? (alignment(column) === "right" ? "num" : undefined)
  );
}

export function DataTable({
  rows,
  locale,
  dictionary: t,
  maxCoffee,
  maxSleep,
}: {
  rows: CoffeeHealthRow[];
  locale: Locale;
  dictionary: Dictionary;
  /** The largest value in the whole dataset, so bars compare across pages. */
  maxCoffee: number;
  maxSleep: number;
}) {
  return (
    <table className="data-table">
      <caption className="sr-only">{t.tableCaption}</caption>
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <ColumnHead
              key={column}
              column={column}
              label={t.columns[column]}
              sortLabel={t.filters[column]}
              align={alignment(column)}
              sortKey={
                (SORT_KEYS as readonly ColumnKey[]).includes(column)
                  ? (column as SortKey)
                  : null
              }
              className={cellClass(column)}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {COLUMNS.map((column) => (
              <td key={column} className={cellClass(column)}>
                <Cell
                  column={column}
                  row={row}
                  locale={locale}
                  t={t}
                  maxCoffee={maxCoffee}
                  maxSleep={maxSleep}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cell({
  column,
  row,
  locale,
  t,
  maxCoffee,
  maxSleep,
}: {
  column: ColumnKey;
  row: CoffeeHealthRow;
  locale: Locale;
  t: Dictionary;
  maxCoffee: number;
  maxSleep: number;
}) {
  switch (column) {
    case "coffee_intake":
      return (
        <span className="pair">
          {formatNumber(locale, row.coffee_intake, 1)}
          <Bar value={row.coffee_intake} max={maxCoffee} kind="coffee" />
        </span>
      );
    case "sleep_hours":
      return (
        <span className="pair">
          <Bar value={row.sleep_hours} max={maxSleep} kind="sleep" />
          {formatNumber(locale, row.sleep_hours, 1)}
        </span>
      );
    case "sleep_quality":
    case "stress_level":
    case "health_issues": {
      const scale: readonly string[] = ENUM_OPTIONS[column];
      // "None" is the zero of the health scale. The other scales start at one.
      const offset = column === "health_issues" ? 0 : 1;
      return (
        <span className="pair">
          <Level
            level={scale.indexOf(row[column]) + offset}
            steps={scale.length - 1 + offset}
            tone={column === "sleep_quality" ? "sleep" : "ink"}
          />
          {valueLabel(t, row[column], column)}
        </span>
      );
    }
    case "gender":
    case "country":
    case "occupation":
      return valueLabel(t, row[column], column);
    case "smoking":
    case "alcohol_consumption":
      return row[column] ? t.yes : <span className="no">{t.no}</span>;
    case "id":
      // An id is a label, not a quantity, so it gets no thousands separator.
      return row.id;
    default:
      return formatNumber(locale, row[column], DIGITS[column]);
  }
}

function Bar({
  value,
  max,
  kind,
}: {
  value: number;
  max: number;
  kind: "coffee" | "sleep";
}) {
  const share = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return (
    <span
      aria-hidden
      className={`bar ${kind}`}
      style={
        { "--share": `${Math.round(share * 100)}%` } as React.CSSProperties
      }
    />
  );
}

function Level({
  level,
  steps,
  tone,
}: {
  level: number;
  steps: number;
  tone: "ink" | "sleep";
}) {
  return (
    <span
      aria-hidden
      className={`level ${tone}`}
      data-steps={steps}
      data-level={level}
    />
  );
}
