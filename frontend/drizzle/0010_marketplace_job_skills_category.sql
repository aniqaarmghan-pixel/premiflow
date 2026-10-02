-- Marketplace: job skills and optional category (off-chain only).
-- Additive: two defaulted/nullable columns plus checks; no data is rewritten or dropped.
-- Existing jobs get skills = [] and category = NULL (search derives category from keywords).
ALTER TABLE "marketplace_jobs" ADD COLUMN IF NOT EXISTS "skills" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "marketplace_jobs" ADD COLUMN IF NOT EXISTS "category" text;
--> statement-breakpoint
ALTER TABLE "marketplace_jobs" ADD CONSTRAINT "marketplace_jobs_skills_array"
  CHECK (jsonb_typeof("skills") = 'array' AND jsonb_array_length("skills") <= 10);
--> statement-breakpoint
ALTER TABLE "marketplace_jobs" ADD CONSTRAINT "marketplace_jobs_category_enum"
  CHECK ("category" IS NULL OR "category" in ('development', 'web3', 'design', 'ai', 'video', 'marketing', 'writing', 'business'));
