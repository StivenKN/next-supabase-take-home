-- Measures the explorer's queries against a 2 million row copy of the dataset.
--
--   docker exec -i supabase_db_take-home psql -U postgres -d postgres < scripts/bench-scale.sql
--
-- It builds bench.coffee_health (200 copies of public.coffee_health with the
-- same indexes), runs each query shape the page can produce under
-- EXPLAIN ANALYZE, and drops the bench schema at the end. The Scale section of
-- README.md records the results.
\timing on
drop schema if exists bench cascade;
create schema bench;
create table bench.coffee_health (like public.coffee_health including all);
insert into bench.coffee_health
select (g * 10000 + c.id), age, gender, country, coffee_intake, caffeine_mg, sleep_hours, sleep_quality, bmi, heart_rate, stress_level, physical_activity_hours, health_issues, occupation, smoking, alcohol_consumption
from public.coffee_health c cross join generate_series(0, 199) g;
vacuum analyze bench.coffee_health;
select count(*) as rows, pg_size_pretty(pg_table_size('bench.coffee_health')) as table_size, pg_size_pretty(pg_indexes_size('bench.coffee_health')) as index_size from bench.coffee_health;
set search_path = bench;
\echo == Q1 default page
explain (analyze, costs off, timing off, summary on) select * from coffee_health order by id limit 50;
\echo == Q2 exact count unfiltered
explain (analyze, costs off, timing off) select count(*) from coffee_health;
\echo == Q3a sort indexed col
explain (analyze, costs off, timing off) select * from coffee_health order by caffeine_mg desc, id desc limit 50;
\echo == Q3b sort unindexed col
explain (analyze, costs off, timing off) select * from coffee_health order by physical_activity_hours desc, id limit 50;
\echo == Q4a country filter page
explain (analyze, costs off, timing off) select * from coffee_health where country in ('Brazil','Germany') order by id limit 50;
\echo == Q4b country filter count
explain (analyze, costs off, timing off) select count(*) from coffee_health where country in ('Brazil','Germany');
\echo == Q5a enum + range filter page
explain (analyze, costs off, timing off) select * from coffee_health where stress_level = 'High' and sleep_hours <= 5 order by id limit 50;
\echo == Q5b enum + range filter count
explain (analyze, costs off, timing off) select count(*) from coffee_health where stress_level = 'High' and sleep_hours <= 5;
\echo == Q6 deep offset
explain (analyze, costs off, timing off) select * from coffee_health order by id limit 50 offset 1000000;
\echo == Q6b deep offset sorted by indexed col
explain (analyze, costs off, timing off) select * from coffee_health order by bmi, id limit 50 offset 1000000;
\echo == Q7 rare filter + sort
explain (analyze, costs off, timing off) select * from coffee_health where gender = 'Other' order by age desc, id desc limit 50;
\echo == Q7b very rare filter + sort (Severe = 0.17%)
explain (analyze, costs off, timing off) select * from coffee_health where health_issues = 'Severe' order by age desc, id desc limit 50;
\echo == Q7c no rows match, sorted
explain (analyze, costs off, timing off) select * from coffee_health where health_issues = 'Severe' and gender = 'Other' and country = 'USA' and smoking order by age, id limit 50;
\echo == Q8 many filters count
explain (analyze, costs off, timing off) select count(*) from coffee_health where gender in ('Female') and occupation in ('Office','Student') and age between 30 and 50 and bmi >= 25;
\echo == Q9 distinct country plain
explain (analyze, costs off, timing off) select distinct country from coffee_health;
\echo == Q9b loose index scan
explain (analyze, costs off, timing off) with recursive countries as ((select country from coffee_health order by country limit 1) union all select (select c.country from coffee_health c where c.country > countries.country order by c.country limit 1) from countries where countries.country is not null) select country from countries where country is not null;
\echo == Q10 min max
explain (analyze, costs off, timing off) select min(age), max(age), min(bmi), max(bmi) from coffee_health;
reset search_path;
drop schema bench cascade;
