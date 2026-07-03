import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["free", "starter", "pro"]);
export const pageKindEnum = pgEnum("page_kind", [
  "pricing",
  "features",
  "changelog",
  "blog",
  "home",
  "custom",
]);
export const pageStatusEnum = pgEnum("page_status", ["active", "degraded", "paused"]);
export const sectionKindEnum = pgEnum("section_kind", ["text", "pricing_table"]);
export const changeTypeEnum = pgEnum("change_type", ["added", "removed", "modified"]);
export const changeCategoryEnum = pgEnum("change_category", [
  "pricing",
  "packaging",
  "feature",
  "messaging",
  "content",
  "legal",
  "other",
]);
export const changeStatusEnum = pgEnum("change_status", [
  "pending",
  "classified",
  "noise",
  "error",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: planEnum("plan").notNull().default("free"),
  ...timestamps,
});

export const competitors = pgTable(
  "competitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    ...timestamps,
  },
  (t) => [index("competitors_workspace_idx").on(t.workspaceId)],
);

export const trackedPages = pgTable(
  "tracked_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitorId: uuid("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    kind: pageKindEnum("kind").notNull().default("custom"),
    status: pageStatusEnum("status").notNull().default("active"),
    crawlIntervalMinutes: integer("crawl_interval_minutes").notNull().default(1440),
    nextCrawlAt: timestamp("next_crawl_at", { withTimezone: true }).notNull().defaultNow(),
    lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }),
    failureCount: integer("failure_count").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("tracked_pages_due_idx").on(t.status, t.nextCrawlAt),
    index("tracked_pages_competitor_idx").on(t.competitorId),
  ],
);

export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => trackedPages.id, { onDelete: "cascade" }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    httpStatus: integer("http_status"),
    /** Key of the archived raw HTML in R2 / local storage — the re-extraction source. */
    rawHtmlKey: text("raw_html_key").notNull(),
    extractVersion: integer("extract_version").notNull(),
    /** Hash over all section hashes: cheap "did anything change" check. */
    contentHash: text("content_hash").notNull(),
  },
  (t) => [index("snapshots_page_fetched_idx").on(t.pageId, t.fetchedAt)],
);

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    anchorKey: text("anchor_key").notNull(),
    kind: sectionKindEnum("kind").notNull(),
    heading: text("heading"),
    position: integer("position").notNull(),
    normalizedText: text("normalized_text").notNull(),
    textHash: text("text_hash").notNull(),
  },
  (t) => [index("sections_snapshot_idx").on(t.snapshotId)],
);

export const changes = pgTable(
  "changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => trackedPages.id, { onDelete: "cascade" }),
    fromSnapshotId: uuid("from_snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    toSnapshotId: uuid("to_snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    anchorKey: text("anchor_key").notNull(),
    changeType: changeTypeEnum("change_type").notNull(),
    sectionKind: sectionKindEnum("section_kind").notNull(),
    heading: text("heading"),
    beforeText: text("before_text"),
    afterText: text("after_text"),
    diffSummary: text("diff_summary").notNull(),
    status: changeStatusEnum("status").notNull().default("pending"),
    /** Set when status = noise: which heuristic gated it. */
    noiseRule: text("noise_rule"),
    // LLM classification (status = classified):
    category: changeCategoryEnum("category"),
    severity: integer("severity"),
    headline: text("headline"),
    whyItMatters: text("why_it_matters"),
    ...timestamps,
  },
  (t) => [
    index("changes_page_created_idx").on(t.pageId, t.createdAt),
    index("changes_status_idx").on(t.status),
  ],
);

export const llmCalls = pgTable(
  "llm_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    /** Cost in integer micro-USD (1e-6 USD) — cents are too coarse for single calls. */
    costMicroUsd: integer("cost_micro_usd").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    success: boolean("success").notNull().default(true),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("llm_calls_purpose_idx").on(t.purpose, t.createdAt)],
);

export const briefs = pgTable(
  "briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    contentMd: text("content_md").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("briefs_workspace_idx").on(t.workspaceId, t.periodEnd)],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    changeId: uuid("change_id")
      .notNull()
      .references(() => changes.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("email"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("alerts_workspace_idx").on(t.workspaceId, t.createdAt)],
);
