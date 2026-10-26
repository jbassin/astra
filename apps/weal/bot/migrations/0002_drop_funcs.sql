-- 0002: drop the dead v1 `funcs` table, which only the live database has (11 rows of v1 macro
-- ASTs that v2 never read). Exported first to /ruby/data/astra-state/weal/funcs-v1-2026-10-26.sql
-- (a pg_dump; restores with psql). Its id sequence is owned by the column and goes with it.
-- `if exists`: a fresh database never had the table.
drop table if exists funcs;
