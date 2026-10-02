CREATE TABLE "case_evidence_snapshots" (
  "id" uuid PRIMARY KEY NOT NULL,
  "case_id" uuid NOT NULL,
  "contract_address" text NOT NULL,
  "message_id" uuid NOT NULL,
  "submitted_by" text NOT NULL,
  "submitted_by_role" text NOT NULL,
  "sender_wallet_snapshot" text NOT NULL,
  "body_snapshot" text NOT NULL,
  "created_at_snapshot" timestamp with time zone NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  CONSTRAINT "case_evidence_submitter_role_enum"
    CHECK ("submitted_by_role" in ('employer', 'freelancer')),
  CONSTRAINT "case_evidence_body_len"
    CHECK (char_length("body_snapshot") between 1 and 2000)
);
--> statement-breakpoint

ALTER TABLE "case_evidence_snapshots"
ADD CONSTRAINT "case_evidence_snapshots_case_id_resolution_cases_id_fk"
FOREIGN KEY ("case_id")
REFERENCES "public"."resolution_cases"("id")
ON DELETE cascade
ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX "case_evidence_case_message_uidx"
ON "case_evidence_snapshots"
USING btree ("case_id","message_id");
--> statement-breakpoint

CREATE INDEX "case_evidence_case_submitted_idx"
ON "case_evidence_snapshots"
USING btree ("case_id","submitted_at","id");
