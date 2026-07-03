CREATE TYPE "public"."change_category" AS ENUM('pricing', 'packaging', 'feature', 'messaging', 'content', 'legal', 'other');--> statement-breakpoint
CREATE TYPE "public"."change_status" AS ENUM('pending', 'classified', 'noise', 'error');--> statement-breakpoint
CREATE TYPE "public"."change_type" AS ENUM('added', 'removed', 'modified');--> statement-breakpoint
CREATE TYPE "public"."page_kind" AS ENUM('pricing', 'features', 'changelog', 'blog', 'home', 'custom');--> statement-breakpoint
CREATE TYPE "public"."page_status" AS ENUM('active', 'degraded', 'paused');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'starter', 'pro');--> statement-breakpoint
CREATE TYPE "public"."section_kind" AS ENUM('text', 'pricing_table');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"change_id" uuid NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"content_md" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"from_snapshot_id" uuid NOT NULL,
	"to_snapshot_id" uuid NOT NULL,
	"anchor_key" text NOT NULL,
	"change_type" "change_type" NOT NULL,
	"section_kind" "section_kind" NOT NULL,
	"heading" text,
	"before_text" text,
	"after_text" text,
	"diff_summary" text NOT NULL,
	"status" "change_status" DEFAULT 'pending' NOT NULL,
	"noise_rule" text,
	"category" "change_category",
	"severity" integer,
	"headline" text,
	"why_it_matters" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost_micro_usd" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"anchor_key" text NOT NULL,
	"kind" "section_kind" NOT NULL,
	"heading" text,
	"position" integer NOT NULL,
	"normalized_text" text NOT NULL,
	"text_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"http_status" integer,
	"raw_html_key" text NOT NULL,
	"extract_version" integer NOT NULL,
	"content_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"url" text NOT NULL,
	"kind" "page_kind" DEFAULT 'custom' NOT NULL,
	"status" "page_status" DEFAULT 'active' NOT NULL,
	"crawl_interval_minutes" integer DEFAULT 1440 NOT NULL,
	"next_crawl_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_crawled_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_change_id_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."changes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_page_id_tracked_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."tracked_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_from_snapshot_id_snapshots_id_fk" FOREIGN KEY ("from_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_to_snapshot_id_snapshots_id_fk" FOREIGN KEY ("to_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_page_id_tracked_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."tracked_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_pages" ADD CONSTRAINT "tracked_pages_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_workspace_idx" ON "alerts" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "briefs_workspace_idx" ON "briefs" USING btree ("workspace_id","period_end");--> statement-breakpoint
CREATE INDEX "changes_page_created_idx" ON "changes" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX "changes_status_idx" ON "changes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "competitors_workspace_idx" ON "competitors" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "llm_calls_purpose_idx" ON "llm_calls" USING btree ("purpose","created_at");--> statement-breakpoint
CREATE INDEX "sections_snapshot_idx" ON "sections" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "snapshots_page_fetched_idx" ON "snapshots" USING btree ("page_id","fetched_at");--> statement-breakpoint
CREATE INDEX "tracked_pages_due_idx" ON "tracked_pages" USING btree ("status","next_crawl_at");--> statement-breakpoint
CREATE INDEX "tracked_pages_competitor_idx" ON "tracked_pages" USING btree ("competitor_id");