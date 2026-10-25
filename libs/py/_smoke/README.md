# astra-smoke — the Python lane's smoke test

A one-function package (`ping()` returns `"pong"`) and one test. It proves that the uv
workspace builds, imports and runs pytest. Nothing imports it. Run it with
`uv run pytest libs/py/_smoke`. Its TypeScript twin is
[`libs/ts/_smoke`](../../ts/_smoke/README.md).
