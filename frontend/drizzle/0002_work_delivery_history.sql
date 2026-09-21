CREATE TABLE "contract_work_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_address" text NOT NULL,
	"submission_kind" text NOT NULL,
	"work_unit_index" integer NOT NULL,
	"revision_number" integer NOT NULL,
	"freelancer_wallet" text NOT NULL,
	"delivery_note" text NOT NULL,
	"on_chain_submission_uri" text NOT NULL,
	"transaction_signature" text,
	"chain_submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "contract_work_submissions_kind_enum" CHECK ("contract_work_submissions"."submission_kind" in ('trial', 'fixed', 'milestone')),
	CONSTRAINT "contract_work_submissions_note_len" CHECK (char_length("contract_work_submissions"."delivery_note") between 1 and 4000),
	CONSTRAINT "contract_work_submissions_uri_len" CHECK (char_length("contract_work_submissions"."on_chain_submission_uri") between 1 and 200),
	CONSTRAINT "contract_work_submissions_revision_nonneg" CHECK ("contract_work_submissions"."revision_number" >= 0),
	CONSTRAINT "contract_work_submissions_index_nonneg" CHECK ("contract_work_submissions"."work_unit_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contract_work_submission_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"submission_id" uuid NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"position" integer NOT NULL,
	CONSTRAINT "contract_work_submission_links_url_len" CHECK (char_length("contract_work_submission_links"."url") between 1 and 200),
	CONSTRAINT "contract_work_submission_links_label_len" CHECK ("contract_work_submission_links"."label" is null or char_length("contract_work_submission_links"."label") between 1 and 80),
	CONSTRAINT "contract_work_submission_links_position_nonneg" CHECK ("contract_work_submission_links"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "contract_work_submission_links" ADD CONSTRAINT "contract_work_submission_links_submission_id_contract_work_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."contract_work_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_work_submissions_contract_created_idx" ON "contract_work_submissions" USING btree ("contract_address","created_at","id");--> statement-breakpoint
CREATE INDEX "contract_work_submissions_contract_unit_idx" ON "contract_work_submissions" USING btree ("contract_address","submission_kind","work_unit_index","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_work_submissions_tx_sig_uidx" ON "contract_work_submissions" USING btree ("transaction_signature");--> statement-breakpoint
CREATE INDEX "contract_work_submission_links_submission_idx" ON "contract_work_submission_links" USING btree ("submission_id","position");
