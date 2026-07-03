# RivalWatch — System Plan

## 1. Product

Competitive intelligence autopilot for indie SaaS founders. We crawl competitor
pages, detect meaningful changes via semantic diffing on extracted sections,
classify them with an LLM, and deliver weekly strategic briefs plus instant
alerts for high-severity pricing/packaging changes. The pipeline is the
product; the dashboard is a shell around it.

## 2. Architecture

### 2.1 Workspaces

| Workspace         | Role                                                        |
| ----------------- | ----------------------------------------------------------- |
| `apps/web`        | Next.js 15 dashboard, marketing, auth, billing webhooks     |
| `apps/worker`     | BullMQ queue consumers + cron scheduler                     |
| `packages/core`   | Pure logic: extract, diff, noise gate, hash, robots, errors |
| `packages/db`     | Drizzle schema + query helpers + plan limits                |
| `packages/llm`    | Multi-provider gateway (anthropic/gemini/groq) + prompts + evals |
| `packages/emails` | React Email templates (plain HTML/JSX, no SDK — apps/worker sends) |
| `packages/config` | Zod-validated env                                           |

### 2.2 System diagram

> Keep this diagram current: any PR that adds a pipeline stage or queue must
> update it (see CLAUDE.md).

```
                 cron scheduler (apps/worker/src/index.ts)
                 polls tracked_pages where next_crawl_at <= now,
                 checks plan limits, enqueues with jitter
                        │
                        ▼
                 ┌────────────┐   raw HTML ──► storage (R2 / local fs)
                 │   crawl    │   snapshot row ──► Postgres
                 │  (queue)   │   politeness: robots.txt, per-domain
                 └─────┬──────┘   concurrency 1, backoff, degraded @3 fails
                       ▼
                 ┌────────────┐   sections (heading-anchored + pricing
                 │  extract   │   tables) via packages/core/extract.ts
                 └─────┬──────┘   stamped with EXTRACT_VERSION
                       ▼
                 ┌────────────┐   vs previous snapshot (same extract_version;
                 │    diff    │   re-extract old raw HTML if version bumped)
                 └─────┬──────┘   → noise-gate.ts (heuristics, pre-LLM)
                       ▼              surviving diffs = changes (pending)
                 ┌────────────┐   packages/llm classify-change prompt
                 │  classify  │   → category + severity 1-5 + headline
                 └─────┬──────┘     + why_it_matters
                       ▼
              severity ≥4 pricing/packaging
                       │
                       ▼
                 ┌────────────┐   records alerts row, emails workspace owner
                 │   alert    │   via apps/worker/src/email.ts (Resend)
                 └────────────┘
                       ┆
                 ┌────────────┐   hourly scheduler tick, ≤1 per workspace per
                 │   brief    │   7 days: LLM synthesis of the week's classified
                 └─────┬──────┘   changes → briefs table
                       ▼
                 ┌────────────┐   Resend email via packages/emails templates +
                 │  deliver   │   apps/worker/src/email.ts
                 └────────────┘
```

Every LLM call in classify/brief goes through `packages/llm/gateway.ts` and is
logged to the `llm_calls` table with tokens + cost.

## 3. Roadmap

- **Phase 1 (done):** monorepo scaffold, config, db schema, core
  extract/diff/noise-gate with fixture tests, multi-provider llm gateway
  (anthropic/gemini/groq) + classify + evals, worker pipeline crawl→classify,
  minimal web shell.
- **Phase 2 (done):** better-auth (email/password, drizzle adapter),
  workspace auto-provisioning (one workspace per signed-in user), dashboard
  overview (counts, degraded-page banner, recent changes), competitors
  list/detail pages (incl. delete), tracked-page management
  (add/pause/reactivate) via server actions, change feed with status filters.
- **Phase 3 (done):** packages/emails (plain HTML/JSX templates — instant
  alert + weekly brief), `synthesizeBrief` LLM prompt, `brief`/`deliver`
  queues, hourly brief scheduler, Resend delivery for both alerts and briefs
  (apps/worker/src/email.ts), all gated by `hasResendConfigured()`.
- **Phase 4 (done):** Lemon Squeezy checkout (`apps/web/lib/lemonsqueezy.ts`)
  + webhook (`app/api/webhooks/ls/route.ts`, HMAC-verified), `/billing`
  dashboard page (plan, usage bars, upgrade, manage-subscription link),
  proactive usage indicator on the competitors page.
