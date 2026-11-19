#!/usr/bin/env bash
# Loads data/synthetic_coffee_health_10000.csv into public.coffee_health with
# Postgres COPY. Safe to re-run: the truncate, the copy, and the row-count
# check share one transaction, so a failed load leaves the previous rows.
#
# --if-empty: do nothing when the table already has rows. `pnpm setup:env`
# uses it, so a fresh clone gets the data without reloading on every run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CSV="$ROOT/data/synthetic_coffee_health_10000.csv"
PROJECT_ID="$(sed -n 's/^project_id *= *"\(.*\)"/\1/p' "$ROOT/supabase/config.toml")"
CONTAINER="supabase_db_${PROJECT_ID}"

EXPECTED_HEADER="ID,Age,Gender,Country,Coffee_Intake,Caffeine_mg,Sleep_Hours,Sleep_Quality,BMI,Heart_Rate,Stress_Level,Physical_Activity_Hours,Health_Issues,Occupation,Smoking,Alcohol_Consumption"
COLUMNS="id, age, gender, country, coffee_intake, caffeine_mg, sleep_hours, sleep_quality, bmi, heart_rate, stress_level, physical_activity_hours, health_issues, occupation, smoking, alcohol_consumption"

if_empty=false
for arg in "$@"; do
  case "$arg" in
    --if-empty) if_empty=true ;;
    *)
      echo "error: unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

fail() {
  echo "error: $*" >&2
  exit 1
}

[[ -f "$CSV" ]] || fail "$CSV not found"

# COPY maps columns by position, so a reordered CSV would load into the wrong
# columns without an error.
actual_header="$(head -n 1 "$CSV" | tr -d '\r')"
if [[ "$actual_header" != "$EXPECTED_HEADER" ]]; then
  echo "  expected: $EXPECTED_HEADER" >&2
  echo "  found:    $actual_header" >&2
  fail "unexpected CSV header in $CSV"
fi

[[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" == true ]] ||
  fail "database container $CONTAINER is not running. Run pnpm setup:env first."

psql() {
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

[[ -n "$(psql -At -c "select to_regclass('public.coffee_health')")" ]] ||
  fail "table public.coffee_health does not exist. Run pnpm db:reset to apply the migrations and load the CSV."

if [[ "$if_empty" == true ]]; then
  existing_rows="$(psql -At -c "select count(*) from public.coffee_health")"
  if ((existing_rows > 0)); then
    echo "public.coffee_health already has $existing_rows rows, not reloading"
    exit 0
  fi
fi

csv_rows="$(tail -n +2 "$CSV" | grep -c . || true)"

# The count check is inside the transaction, so a short load rolls back with
# the truncate and leaves the previous rows.
psql --quiet --single-transaction \
  -c "truncate table public.coffee_health" \
  -c "\\copy public.coffee_health ($COLUMNS) from pstdin with (format csv, header true)" \
  -c "do \$\$ declare loaded bigint; begin select count(*) into loaded from public.coffee_health; if loaded <> $csv_rows then raise exception 'loaded % rows but the CSV has $csv_rows', loaded; end if; end \$\$" \
  < "$CSV"

psql --quiet -c "analyze public.coffee_health"

echo "Loaded $csv_rows rows into public.coffee_health"
