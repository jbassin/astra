# Architecture decision records

Each file records one binding decision: its context, the decision and its consequences. Read the log before re-raising a settled question, and check the accepted risks before reporting a security finding.

To change a decision, add a new ADR and mark the old one `Superseded by NNNN`; never rewrite an accepted ADR. Number new ADRs sequentially and add a row below.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-docs-layout-and-adr-log.md) | Living docs in docs/, history in the archive, decisions as ADRs | Accepted |
| [0002](0002-weal-bot-in-typescript.md) | weal-bot is written in TypeScript | Accepted |
| [0003](0003-one-content-format-vellum.md) | All akasha content is vellum | Accepted |
| [0004](0004-akasha-build-time-snapshot.md) | akasha reads a build-time snapshot | Accepted |
| [0005](0005-sops-secrets-injected-at-deploy.md) | Secrets are SOPS-encrypted in the repo and injected at deploy | Accepted |
| [0006](0006-postgres-for-app-data.md) | Postgres stores app data | Accepted |
| [0007](0007-groq-hosted-whisper.md) | Transcription uses Groq's hosted Whisper | Accepted |
| [0008](0008-split-runtime.md) | Dagster runs the pipeline, Compose runs services, Caddy is the edge, SigNoz observes | Accepted |
| [0009](0009-ssr-frontends.md) | Frontends are server-rendered Compose services | Accepted |
| [0010](0010-rust-confined-to-weal-engine.md) | Rust is confined to the weal engine, shipped as committed wasm | Accepted; the no-CI-lane clause is superseded by 0027 |
| [0011](0011-process-without-tiers.md) | No process tiers; CLAUDE.md "How work gets done" is the process | Accepted |
| [0012](0012-block-red-not-alert.md) | Bad changes are blocked, not reported | Accepted |
| [0013](0013-how-claude-asks-questions.md) | Short decisions use the question tool; decisions with context use plain text | Accepted |
| [0014](0014-rtk-removed.md) | The RTK output-rewriting hook is removed | Accepted (done) |
| [0015](0015-repo-layout-by-domain.md) | The repo is laid out by domain | Accepted (done 2026-10-23) |
| [0016](0016-merge-model-auto-merge.md) | Changes merge through branches with auto-merge behind ci-ok | Accepted (done) |
| [0017](0017-repo-stays-public.md) | The repo stays public without a history scrub | Accepted (accepted risk) |
| [0018](0018-book-binaries-stay-in-history.md) | Book binaries stay in history; stop committing new ones | Accepted, partly built |
| [0019](0019-assay-scope.md) | assay keeps the scorer, store and book; the workshop is archived | Accepted, not yet built |
| [0020](0020-delete-codex-assay-block.md) | Delete the hidden codex assay block | Accepted (done) |
| [0021](0021-delete-linguist-correction-loop.md) | Delete the linguist correction loop | Accepted, not yet built |
| [0022](0022-delete-cartesia-and-anthropic-fallbacks.md) | Delete the Cartesia and Anthropic fallbacks | Accepted, not yet built |
| [0023](0023-mouthpiece-tools-package.md) | The mouthpiece experiment harness and roundtable move to a tools package | Accepted, not yet built |
| [0024](0024-strider-editor-dev-only.md) | strider's editor is dev-only | Accepted, not yet built |
| [0025](0025-weal-roll-history-archive.md) | weal roll history is an archive, written after the reply | Accepted, not yet built |
| [0026](0026-codex-url-alias-removal-date.md) | codex's "forever" URL aliases get a removal date | Accepted, not yet built |
| [0027](0027-rust-ci-lane.md) | Rust gets a path-filtered CI lane and a source-hash check | Accepted (done) |
| [0028](0028-replace-vite-plus.md) | Replace vite-plus with pnpm -r and root vitest projects | Accepted, partly built |
| [0029](0029-python-312-mise-just.md) | Python 3.12, mise-pinned host tools, and one just entry point | Accepted (done) |
| [0030](0030-dagster-docker-run-launcher.md) | Dagster adopts the Docker run launcher | Accepted, not yet built |
| [0031](0031-akasha-spa-navigation.md) | akasha uses SPA navigation with server functions | Accepted, not yet built |
| [0032](0032-one-design-token-source.md) | One design-token source generates two themes | Accepted, not yet built |
| [0033](0033-deploy-checkout-and-just-deploy.md) | Production builds from a deploy checkout with one deploy command | Accepted (done) |
| [0034](0034-one-data-root.md) | All runtime data lives under /ruby/data/astra-state | Accepted (done) |
| [0035](0035-astra-data-repo.md) | Pipeline output lives in the public astra-data repo | Accepted (done) |
| [0036](0036-secrets-fail-closed.md) | Secrets fail closed | Accepted (done) |
| [0037](0037-backups-to-local-disk.md) | Nightly backups go to the local sda disk only | Accepted (done) |
| [0038](0038-accepted-risk-portal-query-registry.md) | Accepted risk: portal handlers in Foundry's global query registry | Accepted risk |
| [0039](0039-accepted-risk-edge-dns-token.md) | Accepted risk: the edge's DNS token handling | Accepted risk |
| [0040](0040-accepted-risk-network-exposure.md) | Accepted risk: service ports published on all interfaces | Accepted risk |
| [0041](0041-accepted-risk-no-secret-rotation.md) | Accepted risk: secrets are not rotated after appearing in chat | Accepted risk |
| [0042](0042-accepted-risk-open-otlp-ingest.md) | Accepted risk: public unauthenticated OTLP ingest | Accepted risk |
| [0043](0043-accepted-risk-minor-security-items.md) | Accepted risk: the smaller security findings | Accepted risk |
