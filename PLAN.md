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
| `packages/llm`    | Anthropic gateway + prompts + evals (sole SDK import)       |
| `packages/emails` | React Email templates (Phase 3)                             |
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
                 ┌────────────┐   instant alert email (Phase 3: Resend);
                 │   alert    │   Phase 1 records to alerts table
                 └────────────┘
                       ┆
                 ┌────────────┐   weekly cron per workspace: LLM synthesis
                 │   brief    │   of the week's changes → briefs table
                 └─────┬──────┘   (Phase 3)
                       ▼
                 ┌────────────┐   Resend email via packages/emails
                 │  deliver   │   (Phase 3)
                 └────────────┘
```

Every LLM call in classify/brief goes through `packages/llm/gateway.ts` and is
logged to the `llm_calls` table with tokens + cost.

## 3. Roadmap

- **Phase 1 (current):** monorepo scaffold, config, db schema, core
  extract/diff/noise-gate with fixture tests, llm gateway + classify + evals,
  worker pipeline crawl→classify, minimal web shell.
- **Phase 2:** better-auth, dashboard (competitors, tracked pages, change feed,
  degraded-page surfacing), server actions.
- **Phase 3:** packages/emails, weekly brief queue + prompt, Resend delivery,
  instant alerts.
- **Phase 4:** Lemon Squeezy checkout + webhooks, plan enforcement UI.
