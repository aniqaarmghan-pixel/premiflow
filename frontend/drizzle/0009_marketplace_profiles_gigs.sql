-- Marketplace Phase 2 (off-chain only): public profiles and freelancer gigs.
-- Additive: creates two new tables; existing tables are not altered.
-- No ratings or reputation columns by design.
CREATE TABLE "marketplace_profiles" (
  "wallet" text PRIMARY KEY NOT NULL,
  "display_name" text DEFAULT '' NOT NULL,
  "avatar_url" text,
  "headline" text DEFAULT '' NOT NULL,
  "bio" text DEFAULT '' NOT NULL,
  "skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rate_amount" text,
  "availability" text DEFAULT 'available' NOT NULL,
  "portfolio" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "marketplace_profiles_availability_enum"
    CHECK ("availability" in ('available', 'limited', 'unavailable')),
  CONSTRAINT "marketplace_profiles_display_name_len"
    CHECK (char_length("display_name") <= 60),
  CONSTRAINT "marketplace_profiles_headline_len"
    CHECK (char_length("headline") <= 120),
  CONSTRAINT "marketplace_profiles_bio_len"
    CHECK (char_length("bio") <= 2000),
  CONSTRAINT "marketplace_profiles_avatar_https"
    CHECK ("avatar_url" IS NULL OR ("avatar_url" LIKE 'https://%' AND char_length("avatar_url") <= 500)),
  CONSTRAINT "marketplace_profiles_rate_digits"
    CHECK ("rate_amount" IS NULL OR "rate_amount" ~ '^[0-9]{1,20}$'),
  CONSTRAINT "marketplace_profiles_skills_array"
    CHECK (jsonb_typeof("skills") = 'array' AND jsonb_array_length("skills") <= 15),
  CONSTRAINT "marketplace_profiles_portfolio_array"
    CHECK (jsonb_typeof("portfolio") = 'array' AND jsonb_array_length("portfolio") <= 6)
);
--> statement-breakpoint

CREATE TABLE "marketplace_gigs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "freelancer_wallet" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "payment_mode" text NOT NULL,
  "price_amount" text NOT NULL,
  "token_mint" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "marketplace_gigs_payment_mode_enum"
    CHECK ("payment_mode" in ('Fixed', 'Milestone', 'Streaming', 'Hourly')),
  CONSTRAINT "marketplace_gigs_status_enum"
    CHECK ("status" in ('active', 'paused')),
  CONSTRAINT "marketplace_gigs_title_len"
    CHECK (char_length("title") between 1 and 120),
  CONSTRAINT "marketplace_gigs_description_len"
    CHECK (char_length("description") between 1 and 4000),
  CONSTRAINT "marketplace_gigs_price_digits"
    CHECK ("price_amount" ~ '^[0-9]{1,20}$'),
  CONSTRAINT "marketplace_gigs_skills_array"
    CHECK (jsonb_typeof("skills") = 'array' AND jsonb_array_length("skills") <= 10)
);
--> statement-breakpoint

CREATE INDEX "marketplace_gigs_status_created_idx"
ON "marketplace_gigs"
USING btree ("status","created_at","id");
--> statement-breakpoint

CREATE INDEX "marketplace_gigs_freelancer_created_idx"
ON "marketplace_gigs"
USING btree ("freelancer_wallet","created_at");
