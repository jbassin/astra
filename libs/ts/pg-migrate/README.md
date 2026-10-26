# @astra/pg-migrate — numbered Postgres migrations

The schema runner for astra's Postgres stores, orator-backend (`apps/orator/bot`) and weal-bot
(`apps/weal/bot`). Each app keeps its schema as numbered SQL files in its own `migrations/`
directory and applies them at boot, before it serves anything.

## How it works

- A migration is one file named `NNNN_name.sql`: four digits, then a lower-case name
  (`0002_add_track_rating.sql`). Versions run 0001, 0002, … with no gap or duplicate.
- `migrate(sql, loadMigrations(dir))` takes one connection and a session advisory lock, creates
  the `schema_migrations` ledger if it is missing, and applies each pending file in its own
  transaction together with its ledger row (version, name, sha256 of the file). A second runner on
  the same database waits for the lock, then finds nothing to do.
- It refuses to run, and the app refuses to start, when an applied migration's file changed, was
  renamed or is gone, or when a pending file sorts below an applied one.
- A database that is ahead of the code (an older image after a newer one migrated) is allowed;
  `MigrateResult.ahead` lists the unknown versions and the apps log it at WARN.
- `describeResult(result)` is the one log line the apps emit. The run is one `db.migrate` span.

## Writing a migration

1. Add the next numbered file to the app's `migrations/`. Plain SQL, several statements allowed.
   Don't write `begin`/`commit`: the runner wraps the file in a transaction.
2. Run `just pg-test`; add a `*.pg.test.ts` case for the store code that uses the change.
3. Deploy the app as usual. It applies the file at boot.

## Traps

- **Never edit an applied migration**, not even a comment: the checksum covers the whole file.
  Add a new file instead.
- **0001 in both apps adopts a schema that existed before the ledger.** Every statement in it is
  `if not exists`, so on the live databases it changes nothing and only records itself.
  Later migrations should be plain DDL, not `if not exists`, so a mistake fails loudly.
- **`@astra/pg-migrate/testing` creates and drops databases** on the server
  `ASTRA_TEST_DATABASE_URL` names. Only ever point it at a throwaway server.
- **A connection that dies mid-run fails the run at once.** The runner then neither cleans up nor
  releases the reserved connection: postgres.js has already taken it back, and touching it again
  hangs or crashes the process (postgres.js 3.4.9). Postgres rolls back the open transaction and
  drops the advisory lock with the session. Separately, after a killed connection a plain
  `sql.end()` can wait for ever; pass `{ timeout }`.
- Statements that cannot run inside a transaction (`create index concurrently`) are not supported.
