CREATE TABLE "case_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_wallet" text,
	"payload" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "case_events_type_len" CHECK (char_length("case_events"."event_type") between 1 and 64)
);
--> statement-breakpoint
CREATE TABLE "party_statements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"party_wallet" text NOT NULL,
	"party_role" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "party_statements_role_enum" CHECK ("party_statements"."party_role" in ('employer', 'freelancer')),
	CONSTRAINT "party_statements_body_len" CHECK (char_length("party_statements"."body") between 1 and 4000)
);
--> statement-breakpoint
CREATE TABLE "resolution_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_address" text NOT NULL,
	"dispute_opener" text NOT NULL,
	"dispute_category" text,
	"dispute_description" text,
	"resolver_wallet" text NOT NULL,
	"workflow_status" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"contested_amount_snapshot" text NOT NULL,
	"open_signature" text,
	"resolve_signature" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "resolution_cases_opener_enum" CHECK ("resolution_cases"."dispute_opener" in ('Employer', 'Freelancer')),
	CONSTRAINT "resolution_cases_category_enum" CHECK ("resolution_cases"."dispute_category" is null or "resolution_cases"."dispute_category" in (
        'work_not_delivered',
        'incomplete_work',
        'work_quality',
        'scope',
        'payment',
        'deadline_abandonment',
        'time_hours',
        'other'
      )),
	CONSTRAINT "resolution_cases_workflow_enum" CHECK ("resolution_cases"."workflow_status" in (
        'awaiting_statements',
        'ready_for_resolver',
        'under_review',
        'settlement_submitted'
      )),
	CONSTRAINT "resolution_cases_description_len" CHECK ("resolution_cases"."dispute_description" is null or char_length("resolution_cases"."dispute_description") between 0 and 4000),
	CONSTRAINT "resolution_cases_amount_digits" CHECK ("resolution_cases"."contested_amount_snapshot" ~ '^[0-9]+$')
);
--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_resolution_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."resolution_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_statements" ADD CONSTRAINT "party_statements_case_id_resolution_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."resolution_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_events_case_created_idx" ON "case_events" USING btree ("case_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "party_statements_case_wallet_uidx" ON "party_statements" USING btree ("case_id","party_wallet");--> statement-breakpoint
CREATE INDEX "party_statements_case_idx" ON "party_statements" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resolution_cases_contract_address_uidx" ON "resolution_cases" USING btree ("contract_address");--> statement-breakpoint
CREATE INDEX "resolution_cases_resolver_idx" ON "resolution_cases" USING btree ("resolver_wallet");