-- 0001: the weal schema as it stood before the migration ledger: the dice archive and
-- funcs_v2. Every statement is `if not exists`, so on the live database (which already
-- has this schema) it changes nothing and only records itself in schema_migrations.
-- The live database also holds the dead v1 `funcs` table, which this file neither
-- creates nor drops; dropping it is a later, separate migration.
-- Never edit an applied migration: the runner refuses a changed checksum.
-- Add a new numbered file instead.
create table if not exists dice (
  id        bigserial   primary key,
  base      integer     not null,
  value     integer     not null,
  source    text        not null default 'discord',
  timestamp timestamptz not null default now(),
  player_id integer     not null,
  blame_id  integer     not null
);
create index if not exists dice_base_timestamp on dice (base, timestamp);

create table if not exists funcs_v2 (
  id     bigserial primary key,
  name   text not null,
  source text not null
);
