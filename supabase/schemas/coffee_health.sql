-- Closed answer sets from the survey. Enums store 4 bytes per value, reject
-- unknown values at load time, and sort in declaration order, so "order by
-- sleep_quality" runs Poor, Fair, Good, Excellent instead of alphabetically.
create type public.gender as enum ('Female', 'Male', 'Other');
create type public.occupation as enum ('Healthcare', 'Office', 'Service', 'Student', 'Other');
create type public.sleep_quality as enum ('Poor', 'Fair', 'Good', 'Excellent');
create type public.stress_level as enum ('Low', 'Medium', 'High');
create type public.health_issues as enum ('None', 'Mild', 'Moderate', 'Severe');

create table public.coffee_health (
  id integer primary key,
  age smallint not null check (age between 0 and 130),
  gender public.gender not null,
  -- Country is an open set, so it stays text. New countries load without a migration.
  country text not null check (country <> ''),
  coffee_intake numeric(4, 1) not null check (coffee_intake >= 0),
  caffeine_mg numeric(6, 1) not null check (caffeine_mg >= 0),
  sleep_hours numeric(3, 1) not null check (sleep_hours between 0 and 24),
  sleep_quality public.sleep_quality not null,
  bmi numeric(4, 1) not null check (bmi > 0),
  heart_rate smallint not null check (heart_rate > 0),
  stress_level public.stress_level not null,
  physical_activity_hours numeric(4, 1) not null check (physical_activity_hours >= 0),
  health_issues public.health_issues not null,
  occupation public.occupation not null,
  smoking boolean not null,
  alcohol_consumption boolean not null
);

comment on table public.coffee_health is
  'Synthetic coffee and health survey, one row per respondent. Loaded from data/synthetic_coffee_health_10000.csv by scripts/load-coffee-health.sh.';

-- One (column, id) index per sortable column. Each index serves three jobs:
-- "order by column, id limit 50" reads the first 50 index entries instead of
-- sorting the table, min/max filters on the column become index range scans,
-- and min()/max() for the filter placeholders read one index entry each.
-- The primary key covers the default order by id.
create index coffee_health_country_idx on public.coffee_health (country, id);
create index coffee_health_age_idx on public.coffee_health (age, id);
create index coffee_health_coffee_intake_idx on public.coffee_health (coffee_intake, id);
create index coffee_health_caffeine_mg_idx on public.coffee_health (caffeine_mg, id);
create index coffee_health_sleep_hours_idx on public.coffee_health (sleep_hours, id);
create index coffee_health_bmi_idx on public.coffee_health (bmi, id);
create index coffee_health_heart_rate_idx on public.coffee_health (heart_rate, id);

-- The dataset is public and read-only through the API. Writes go through the
-- loader, which connects as the table owner.
alter table public.coffee_health enable row level security;

create policy "Anyone can read coffee_health"
  on public.coffee_health
  for select
  to anon, authenticated
  using (true);

revoke all on table public.coffee_health from anon, authenticated;
grant select on table public.coffee_health to anon, authenticated;

-- Everything the filter bar needs that depends on the data: the total row
-- count, the list of countries, and the bounds of each numeric filter.
-- The page caches the result, so this runs about once a minute, not per request.
create function public.coffee_health_summary()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with recursive countries as (
    -- Loose index scan: jump from one distinct country to the next through
    -- coffee_health_country_idx. It costs one index probe per country, so it
    -- takes the same time at 10 thousand rows and at 10 million.
    (select country from public.coffee_health order by country limit 1)
    union all
    select (
      select c.country
      from public.coffee_health c
      where c.country > countries.country
      order by c.country
      limit 1
    )
    from countries
    where countries.country is not null
  )
  select jsonb_build_object(
    'total', (select count(*) from public.coffee_health),
    'countries', (
      select coalesce(jsonb_agg(country order by country), '[]'::jsonb)
      from countries
      where country is not null
    ),
    'ranges', jsonb_build_object(
      'age', (select jsonb_build_array(min(age), max(age)) from public.coffee_health),
      'coffee_intake', (select jsonb_build_array(min(coffee_intake), max(coffee_intake)) from public.coffee_health),
      'sleep_hours', (select jsonb_build_array(min(sleep_hours), max(sleep_hours)) from public.coffee_health),
      'bmi', (select jsonb_build_array(min(bmi), max(bmi)) from public.coffee_health)
    )
  );
$$;

revoke all on function public.coffee_health_summary() from public;
grant execute on function public.coffee_health_summary() to anon, authenticated, service_role;
