# CLAUDE.md — RivalWatch

Competitive intelligence autopilot for indie SaaS founders. We crawl competitor pages, detect *meaningful* changes via semantic diffing, classify them with an LLM, and deliver weekly strategic briefs + instant alerts. The pipeline (crawl → extract → diff → classify → brief → deliver) IS the product; the dashboard is a shell around it.

## Commands

```bash
pnpm install                 # workspace install (pnpm only — never npm/yarn)
pnpm dev                     # turbo: web (3000) + worker (watch mode)
pnpm dev:web                 # just the Next.js app
pnpm dev:worker              # just the BullMQ worker
pnpm db:generate             # drizzle-kit generate migrations from schema
pnpm db:migrate              # apply migrations
pnpm db:studio               # drizzle studio
pnpm test                    # vitest across packages
pnpm test:core               # extraction + diffing tests only (fast, run often)
pnpm eval                    # LLM classification against golden fixtures (needs an LLM_PROVIDER key set)
pnpm lint && pnpm typecheck  # run both before considering any task done
docker compose up -d         # local Postgres (5432) + Redis (6379)
```

To manually trigger pipeline stages in dev: `pnpm worker:trigger crawl --page-id=<id>` (see `apps/worker/src/cli.ts`).

## Repo map

```
apps/web            Next.js 15 App Router. Dashboard, marketing pages, auth,
                    Lemon Squeezy webhooks (app/api/webhooks/ls/route.ts).
                    Server components by default; "use client" only when needed.
apps/worker         Long-running Node service. BullMQ queue consumers + cron.
                    Entry: src/index.ts. One file per queue in src/queues/.
packages/core       PURE logic: extract.ts, diff.ts, noise-gate.ts, hash.ts, types.ts.
                    No I/O, no DB, no network. Everything here must be unit-testable.
packages/db         Drizzle schema (src/schema.ts) + query helpers. The only package
                    that talks to Postgres.
packages/llm        gateway.ts + prompts/ + evals/ + providers/ (anthropic, gemini,
                    groq — the ONLY place provider SDKs are imported). Every call
                    logs to the llm_calls table.
packages/emails     React Email templates. Preview: pnpm --filter emails dev.
```

## Invariants (do not violate these)

1. **All LLM calls go through `packages/llm/gateway.ts`.** Provider SDKs (`@anthropic-ai/sdk`, `@google/genai`, `groq-sdk`) may only be imported inside `packages/llm/src/providers/*.ts`. Every call must pass a `purpose` and a zod schema; the gateway logs tokens + cost to `llm_calls`. Provider selection is `LLM_PROVIDER` (auto-detects anthropic > gemini > groq by which key is set; see `packages/config/src/env.ts`).
2. **Diff on extracted sections, never on raw HTML/DOM.** Raw HTML exists only as an R2-archived artifact for re-extraction.
3. **Never diff snapshots with different `extract_version`.** If extraction logic changes, bump `EXTRACT_VERSION` in `packages/core/extract.ts` and re-extract the previous snapshot from stored raw HTML before diffing.
4. **The noise gate runs before any LLM call.** New noise patterns get a heuristic in `noise-gate.ts` + a fixture test — not a prompt tweak — whenever a regex/heuristic can catch them. LLM classification is for judgment calls, not for filtering timestamps.
5. **Crawling is polite:** per-domain concurrency 1, jittered schedules, exponential backoff, honor robots.txt (`packages/core/robots.ts`). Never add retry loops that hammer a failing domain; after 3 failures mark the page `degraded`.
6. **Plan limits are enforced in the DB layer** (`packages/db/src/limits.ts`), not just in UI. Worker must also check limits before crawling (downgraded/expired workspaces).
7. **Prompt changes require running `pnpm eval` and reporting the accuracy delta.** Never edit files in `packages/llm/evals/fixtures/` to make evals pass — fixtures are hand-labeled ground truth.
8. **Strict JSON from LLMs:** gateway retries once on parse failure, then throws. Downstream code never receives unvalidated LLM output.
9. **No secrets in code.** Env via `packages/config/env.ts` (zod-validated at boot; fail fast on missing vars).

## Conventions

- TypeScript strict mode everywhere; no `any` (use `unknown` + narrowing).
- Zod schemas live next to the types they validate; export both (`schema` + `z.infer` type).
- DB access: query helpers in `packages/db/src/queries/`, never raw drizzle calls in app code.
- Queue payloads are zod-validated on both enqueue and consume (`apps/worker/src/queues/schemas.ts`).
- Errors: throw typed errors from `packages/core/errors.ts`; the worker's top-level handler decides retry vs dead-letter.
- UI: Tailwind + shadcn/ui, server actions for mutations, no client-side data fetching where a server component works.
- Money is integer cents. Dates are UTC in DB; convert at the edge.
- Commits: conventional (`feat:`, `fix:`, `chore:`), scoped to package where sensible (`feat(core): ...`).

## Testing

- `packages/core` is the crown jewel: extraction and diffing must have fixture-based tests (`fixtures/pages/*.html` → expected sections; before/after pairs → expected changes). When fixing a diffing bug, ALWAYS add the offending HTML pair as a fixture first.
- Worker queue handlers: test the handler function directly with a mocked deps object; don't spin up Redis in unit tests.
- Don't test Playwright crawling in CI; it's covered by the manual trigger CLI + a nightly smoke job.

## Environment

```
DATABASE_URL=            # postgres
REDIS_URL=               # bullmq
LLM_PROVIDER=auto        # anthropic > gemini > groq priority; see packages/config/src/env.ts
ANTHROPIC_API_KEY=       # packages/llm only
GEMINI_API_KEY=          # packages/llm only — default free-tier provider
GROQ_API_KEY=            # packages/llm only — alternative free-tier provider
RESEND_API_KEY=
R2_ACCOUNT_ID= / R2_ACCESS_KEY_ID= / R2_SECRET_ACCESS_KEY= / R2_BUCKET=
LEMONSQUEEZY_API_KEY= / LEMONSQUEEZY_WEBHOOK_SECRET=
BETTER_AUTH_SECRET= / BETTER_AUTH_URL=
APP_URL=
```

`cp .env.example .env` for local dev; docker-compose provides DB/Redis defaults.

## Domain glossary

- **Snapshot:** one crawl result for one tracked page (raw HTML in R2 + extracted sections in DB).
- **Section:** a semantic block of a page (heading-anchored, or a detected pricing table) with a normalized-text hash. The unit of diffing.
- **Change:** a classified, above-noise difference between two snapshots (category + severity 1–5 + headline + why_it_matters).
- **Brief:** the weekly LLM-written synthesis of a workspace's changes. severity ≥4 price/plan changes also trigger instant alerts.
- **Degraded page:** a tracked page failing crawls; shown honestly in the UI, never silently stale.

## Working style

- Prefer plan mode for anything touching the pipeline (`core`, `worker`, `llm`); these stages are coupled through the DB schema, so state which tables/columns a change touches before editing.
- When adding a pipeline stage or queue, update the system diagram in PLAN.md §2.2 in the same PR.
- After completing any task: `pnpm lint && pnpm typecheck && pnpm test:core`. If prompts changed, also `pnpm eval`.