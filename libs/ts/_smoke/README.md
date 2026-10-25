# @astra/smoke — the TypeScript lane's smoke test

A one-function package (`ping()` returns `"pong"`) and one vitest test. It proves that the pnpm
workspace typechecks and that the root vitest run picks the package up. Nothing imports it.
Run it with `pnpm --filter @astra/smoke test`. Its Python twin is
[`libs/py/_smoke`](../../py/_smoke/README.md).
