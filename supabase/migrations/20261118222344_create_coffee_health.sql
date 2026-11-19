create type "public"."gender" as enum ('Female', 'Male', 'Other');

create type "public"."health_issues" as enum ('None', 'Mild', 'Moderate', 'Severe');

create type "public"."occupation" as enum ('Healthcare', 'Office', 'Service', 'Student', 'Other');

create type "public"."sleep_quality" as enum ('Poor', 'Fair', 'Good', 'Excellent');

create type "public"."stress_level" as enum ('Low', 'Medium', 'High');


  create table "public"."coffee_health" (
    "id" integer not null,
    "age" smallint not null,
    "gender" public.gender not null,
    "country" text not null,
    "coffee_intake" numeric(4,1) not null,
    "caffeine_mg" numeric(6,1) not null,
    "sleep_hours" numeric(3,1) not null,
    "sleep_quality" public.sleep_quality not null,
    "bmi" numeric(4,1) not null,
    "heart_rate" smallint not null,
    "stress_level" public.stress_level not null,
    "physical_activity_hours" numeric(4,1) not null,
    "health_issues" public.health_issues not null,
    "occupation" public.occupation not null,
    "smoking" boolean not null,
    "alcohol_consumption" boolean not null
      );


alter table "public"."coffee_health" enable row level security;

CREATE INDEX coffee_health_age_idx ON public.coffee_health USING btree (age, id);

CREATE INDEX coffee_health_bmi_idx ON public.coffee_health USING btree (bmi, id);

CREATE INDEX coffee_health_caffeine_mg_idx ON public.coffee_health USING btree (caffeine_mg, id);

CREATE INDEX coffee_health_coffee_intake_idx ON public.coffee_health USING btree (coffee_intake, id);

CREATE INDEX coffee_health_country_idx ON public.coffee_health USING btree (country, id);

CREATE INDEX coffee_health_heart_rate_idx ON public.coffee_health USING btree (heart_rate, id);

CREATE UNIQUE INDEX coffee_health_pkey ON public.coffee_health USING btree (id);

CREATE INDEX coffee_health_sleep_hours_idx ON public.coffee_health USING btree (sleep_hours, id);

alter table "public"."coffee_health" add constraint "coffee_health_pkey" PRIMARY KEY using index "coffee_health_pkey";

alter table "public"."coffee_health" add constraint "coffee_health_age_check" CHECK (((age >= 0) AND (age <= 130))) not valid;

alter table "public"."coffee_health" validate constraint "coffee_health_age_check";

alter table "public"."coffee_health" add constraint "coffee_health_bmi_check" CHECK ((bmi > (0)::numeric)) not valid;

alter table "public"."coffee_health" validate constraint "coffee_health_bmi_check";

alter table "public"."coffee_health" add constraint "coffee_health_caffeine_mg_check" CHECK ((caffeine_mg >= (0)::numeric)) not valid;

alter table "public"."coffee_health" validate constraint "coffee_health_caffeine_mg_check";

alter table "public"."coffee_health" add constraint "coffee_health_coffee_intake_check" CHECK ((coffee_intake >= (0)::numeric)) not valid;

alter table "public"."coffee_health" validate constraint "coffee_health_coffee_intake_check";

alter table "public"."coffee_health" add constraint "coffee_health_country_check" CHECK ((country <> ''::text)) not valid;

alter table "public"."coffee_health" validate constraint "coffee_health_country_check";

alter table "public"."coffee_health" add constraint "coffee_health_heart_rate_check" CHECK ((heart_rate > 0)) not valid;

alter table "public"."coffee_health" validate constraint "coffee_health_heart_rate_check";

alter table "public"."coffee_health" add constraint "coffee_health_physical_activity_hours_check" CHECK ((physical_activity_hours >= (0)::numeric)) not valid;

alter table "public"."coffee_health" validate constraint "coffee_health_physical_activity_hours_check";

alter table "public"."coffee_health" add constraint "coffee_health_sleep_hours_check" CHECK (((sleep_hours >= (0)::numeric) AND (sleep_hours <= (24)::numeric))) not valid;

alter table "public"."coffee_health" validate constraint "coffee_health_sleep_hours_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.coffee_health_summary()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$
;

grant select on table "public"."coffee_health" to "anon";

grant select on table "public"."coffee_health" to "authenticated";

grant delete on table "public"."coffee_health" to "service_role";

grant insert on table "public"."coffee_health" to "service_role";

grant references on table "public"."coffee_health" to "service_role";

grant select on table "public"."coffee_health" to "service_role";

grant trigger on table "public"."coffee_health" to "service_role";

grant truncate on table "public"."coffee_health" to "service_role";

grant update on table "public"."coffee_health" to "service_role";


  create policy "Anyone can read coffee_health"
  on "public"."coffee_health"
  as permissive
  for select
  to anon, authenticated
using (true);





-- Added by hand. "supabase db diff" does not emit comments, revokes, or
-- function privileges, so the lines below keep this migration equal to
-- supabase/schemas/coffee_health.sql.
comment on table "public"."coffee_health" is
  'Synthetic coffee and health survey, one row per respondent. Loaded from data/synthetic_coffee_health_10000.csv by scripts/load-coffee-health.sh.';

revoke all on table "public"."coffee_health" from "anon", "authenticated";

grant select on table "public"."coffee_health" to "anon", "authenticated";

revoke all on function public.coffee_health_summary() from public;

grant execute on function public.coffee_health_summary() to "anon", "authenticated", "service_role";
