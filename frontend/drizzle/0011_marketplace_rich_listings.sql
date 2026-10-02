-- Marketplace: rich gig listings (category, cover, gallery, video, delivery, packages) and saved listings.
-- Additive only: nullable/defaulted columns, checks, and one new table. No data is rewritten or dropped.
-- Existing gigs get category/cover/video/delivery = NULL and media/packages = [] (legacy single price).
ALTER TABLE "marketplace_gigs" ADD COLUMN IF NOT EXISTS "category" text;
--> statement-breakpoint
ALTER TABLE "marketplace_gigs" ADD COLUMN IF NOT EXISTS "cover_url" text;
--> statement-breakpoint
ALTER TABLE "marketplace_gigs" ADD COLUMN IF NOT EXISTS "media" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "marketplace_gigs" ADD COLUMN IF NOT EXISTS "video_url" text;
--> statement-breakpoint
ALTER TABLE "marketplace_gigs" ADD COLUMN IF NOT EXISTS "delivery_days" integer;
--> statement-breakpoint
ALTER TABLE "marketplace_gigs" ADD COLUMN IF NOT EXISTS "packages" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "marketplace_gigs" ADD CONSTRAINT "marketplace_gigs_category_enum"
  CHECK ("category" IS NULL OR "category" in ('development', 'web3', 'design', 'ai', 'video', 'marketing', 'writing', 'business'));
--> statement-breakpoint
ALTER TABLE "marketplace_gigs" ADD CONSTRAINT "marketplace_gigs_cover_https"
  CHECK ("cover_url" IS NULL OR ("cover_url" LIKE 'https://%' AND char_length("cover_url") <= 500));
--> statement-breakpoint
ALTER TABLE "marketplace_gigs" ADD CONSTRAINT "marketplace_gigs_video_https"
  CHECK ("video_url" IS NULL OR ("video_url" LIKE 'https://%' AND char_length("video_url") <= 500));
--> statement-breakpoint
ALTER TABLE "marketplace_gigs" ADD CONSTRAINT "marketplace_gigs_media_array"
  CHECK (jsonb_typeof("media") = 'array' AND jsonb_array_length("media") <= 6);
--> statement-breakpoint
ALTER TABLE "marketplace_gigs" ADD CONSTRAINT "marketplace_gigs_packages_array"
  CHECK (jsonb_typeof("packages") = 'array' AND jsonb_array_length("packages") <= 3);
--> statement-breakpoint
ALTER TABLE "marketplace_gigs" ADD CONSTRAINT "marketplace_gigs_delivery_days_range"
  CHECK ("delivery_days" IS NULL OR "delivery_days" BETWEEN 1 AND 365);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplace_favorites" (
  "wallet" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "marketplace_favorites_pk" PRIMARY KEY("wallet","target_type","target_id"),
  CONSTRAINT "marketplace_favorites_target_enum" CHECK ("target_type" in ('job', 'gig'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_favorites_wallet_created_idx" ON "marketplace_favorites" USING btree ("wallet","created_at");
