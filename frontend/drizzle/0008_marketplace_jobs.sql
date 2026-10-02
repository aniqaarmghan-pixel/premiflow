CREATE TABLE "marketplace_jobs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "employer_wallet" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "payment_mode" text NOT NULL,
  "budget_amount" text NOT NULL,
  "token_mint" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "selected_proposal_id" uuid,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "closed_at" timestamp with time zone,
  CONSTRAINT "marketplace_jobs_payment_mode_enum"
    CHECK ("payment_mode" in ('Fixed', 'Milestone', 'Streaming', 'Hourly')),
  CONSTRAINT "marketplace_jobs_status_enum"
    CHECK ("status" in ('open', 'closed', 'filled')),
  CONSTRAINT "marketplace_jobs_title_len"
    CHECK (char_length("title") between 1 and 120),
  CONSTRAINT "marketplace_jobs_description_len"
    CHECK (char_length("description") between 1 and 4000),
  CONSTRAINT "marketplace_jobs_budget_digits"
    CHECK ("budget_amount" ~ '^[0-9]{1,20}$'),
  CONSTRAINT "marketplace_jobs_filled_selection"
    CHECK ("status" <> 'filled' OR "selected_proposal_id" IS NOT NULL)
);
--> statement-breakpoint

CREATE TABLE "marketplace_proposals" (
  "id" uuid PRIMARY KEY NOT NULL,
  "job_id" uuid NOT NULL,
  "freelancer_wallet" text NOT NULL,
  "message" text NOT NULL,
  "proposed_amount" text NOT NULL,
  "status" text DEFAULT 'submitted' NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "marketplace_proposals_status_enum"
    CHECK ("status" in ('submitted', 'withdrawn', 'selected', 'rejected')),
  CONSTRAINT "marketplace_proposals_message_len"
    CHECK (char_length("message") between 1 and 2000),
  CONSTRAINT "marketplace_proposals_amount_digits"
    CHECK ("proposed_amount" ~ '^[0-9]{1,20}$')
);
--> statement-breakpoint

ALTER TABLE "marketplace_proposals"
ADD CONSTRAINT "marketplace_proposals_job_id_marketplace_jobs_id_fk"
FOREIGN KEY ("job_id")
REFERENCES "public"."marketplace_jobs"("id")
ON DELETE cascade
ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "marketplace_jobs_status_created_idx"
ON "marketplace_jobs"
USING btree ("status","created_at","id");
--> statement-breakpoint

CREATE INDEX "marketplace_jobs_employer_created_idx"
ON "marketplace_jobs"
USING btree ("employer_wallet","created_at");
--> statement-breakpoint

CREATE UNIQUE INDEX "marketplace_proposals_job_freelancer_active_uidx"
ON "marketplace_proposals"
USING btree ("job_id","freelancer_wallet")
WHERE "status" in ('submitted', 'selected');
--> statement-breakpoint

CREATE INDEX "marketplace_proposals_job_created_idx"
ON "marketplace_proposals"
USING btree ("job_id","created_at");
--> statement-breakpoint

CREATE INDEX "marketplace_proposals_freelancer_created_idx"
ON "marketplace_proposals"
USING btree ("freelancer_wallet","created_at");
