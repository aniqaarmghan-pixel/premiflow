-- Marketplace Phase 5: trust and hiring (off-chain). Additive only.
-- New tables: verified reviews (Completed contracts only; one per reviewer+contract),
-- job invitations, the employer-private proposal shortlist, and marketplace<->contract links.
-- Summaries are computed from verified reviews on read; nothing editable is stored.
-- The notifications type check is widened (same name, superset of kinds): existing rows stay valid.
CREATE TABLE IF NOT EXISTS "marketplace_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_address" text NOT NULL,
	"reviewer_wallet" text NOT NULL,
	"reviewee_wallet" text NOT NULL,
	"reviewer_role" text NOT NULL,
	"score" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "marketplace_reviews_score_range" CHECK ("score" >= 1 and "score" <= 5),
	CONSTRAINT "marketplace_reviews_body_len" CHECK (char_length("body") <= 1000),
	CONSTRAINT "marketplace_reviews_role_enum" CHECK ("reviewer_role" in ('employer', 'freelancer')),
	CONSTRAINT "marketplace_reviews_not_self" CHECK ("reviewer_wallet" <> "reviewee_wallet")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_reviews_reviewer_contract_uidx" ON "marketplace_reviews" USING btree ("reviewer_wallet","contract_address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_reviews_reviewee_created_idx" ON "marketplace_reviews" USING btree ("reviewee_wallet","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_reviews_contract_idx" ON "marketplace_reviews" USING btree ("contract_address");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplace_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"employer_wallet" text NOT NULL,
	"freelancer_wallet" text NOT NULL,
	"message" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "marketplace_invitations_status_enum" CHECK ("status" in ('pending', 'accepted', 'declined')),
	CONSTRAINT "marketplace_invitations_message_len" CHECK (char_length("message") <= 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_invitations_job_freelancer_uidx" ON "marketplace_invitations" USING btree ("job_id","freelancer_wallet");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_invitations_freelancer_created_idx" ON "marketplace_invitations" USING btree ("freelancer_wallet","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplace_shortlist" (
	"job_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"employer_wallet" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "marketplace_shortlist_pk" PRIMARY KEY("job_id","proposal_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplace_contract_links" (
	"contract_address" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"job_id" uuid,
	"proposal_id" uuid,
	"gig_id" uuid,
	"employer_wallet" text NOT NULL,
	"freelancer_wallet" text NOT NULL,
	"linked_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "marketplace_contract_links_source_enum" CHECK ("source" in ('job', 'gig')),
	CONSTRAINT "marketplace_contract_links_target" CHECK (("source" = 'job' and "job_id" is not null and "proposal_id" is not null and "gig_id" is null) or ("source" = 'gig' and "gig_id" is not null and "job_id" is null))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_contract_links_job_idx" ON "marketplace_contract_links" USING btree ("job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_contract_links_gig_idx" ON "marketplace_contract_links" USING btree ("gig_id");
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_enum";
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_enum" CHECK ("notifications"."type" in (
    'message_received',
    'contract_offer_received',
    'offer_accepted',
    'offer_declined',
    'awaiting_activation',
    'contract_activated',
    'work_submitted',
    'revision_requested',
    'revised_work_submitted',
    'work_approved',
    'payment_released',
    'payment_withdrawn',
    'contract_cancelled',
    'dispute_opened',
    'dispute_resolved',
    'deadline_warning',
    'marketplace_proposal_received',
    'marketplace_proposal_withdrawn',
    'marketplace_proposal_selected',
    'marketplace_invitation_received',
    'marketplace_invitation_accepted',
    'marketplace_invitation_declined',
    'marketplace_gig_hired',
    'marketplace_review_eligible',
    'marketplace_review_received'
  ));
