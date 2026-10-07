-- PREMIFLOW: Admin Help Desk tickets + Resolution Case file evidence.
-- Additive only. Help Desk rows never grant on-chain settlement authority and
-- never reference private contract messages.
CREATE TABLE IF NOT EXISTS "support_tickets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"requester_email" text,
	"category" text NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"contract_address" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "support_tickets_category_enum" CHECK ("category" in ('account', 'wallet', 'marketplace', 'contract', 'payment', 'technical', 'other')),
	CONSTRAINT "support_tickets_status_enum" CHECK ("status" in ('open', 'in_progress', 'resolved')),
	CONSTRAINT "support_tickets_subject_len" CHECK (char_length("subject") between 3 and 160),
	CONSTRAINT "support_tickets_description_len" CHECK (char_length("description") between 10 and 4000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_user_idx" ON "support_tickets" USING btree ("user_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_status_idx" ON "support_tickets" USING btree ("status","updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_ticket_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_role" text NOT NULL,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "support_ticket_messages_author_role_enum" CHECK ("author_role" in ('user', 'admin')),
	CONSTRAINT "support_ticket_messages_body_len" CHECK (char_length("body") between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_ticket_messages_ticket_idx" ON "support_ticket_messages" USING btree ("ticket_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_file_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"contract_address" text NOT NULL,
	"attachment_id" uuid NOT NULL,
	"submitted_by" text NOT NULL,
	"submitted_by_role" text NOT NULL,
	"display_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "case_file_evidence_submitter_role_enum" CHECK ("submitted_by_role" in ('employer', 'freelancer')),
	CONSTRAINT "case_file_evidence_byte_size" CHECK ("byte_size" between 1 and 10485760)
);
--> statement-breakpoint
ALTER TABLE "case_file_evidence" ADD CONSTRAINT "case_file_evidence_case_id_resolution_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."resolution_cases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "case_file_evidence" ADD CONSTRAINT "case_file_evidence_attachment_id_contract_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."contract_attachments"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_file_evidence_attachment_uidx" ON "case_file_evidence" USING btree ("attachment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_file_evidence_case_idx" ON "case_file_evidence" USING btree ("case_id","submitted_at");
--> statement-breakpoint
ALTER TABLE "contract_attachments" DROP CONSTRAINT IF EXISTS "contract_attachments_context_enum";
--> statement-breakpoint
ALTER TABLE "contract_attachments" ADD CONSTRAINT "contract_attachments_context_enum" CHECK ("contract_attachments"."context" in ('message', 'work_submission', 'case_evidence'));
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
    'marketplace_review_received',
    'support_ticket_updated'
  ));
