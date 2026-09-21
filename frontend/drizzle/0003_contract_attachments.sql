CREATE TABLE "contract_attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_address" text NOT NULL,
	"uploader_wallet" text NOT NULL,
	"context" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"blob_url" text NOT NULL,
	"display_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "contract_attachments_context_enum" CHECK ("contract_attachments"."context" in ('message', 'work_submission')),
	CONSTRAINT "contract_attachments_status_enum" CHECK ("contract_attachments"."status" in ('pending', 'active', 'deleted')),
	CONSTRAINT "contract_attachments_filename_len" CHECK (char_length("contract_attachments"."display_filename") between 1 and 180),
	CONSTRAINT "contract_attachments_content_type_len" CHECK (char_length("contract_attachments"."content_type") between 1 and 120),
	CONSTRAINT "contract_attachments_byte_size_positive" CHECK ("contract_attachments"."byte_size" > 0 AND "contract_attachments"."byte_size" <= 10485760),
	CONSTRAINT "contract_attachments_pathname_len" CHECK (char_length("contract_attachments"."blob_pathname") between 1 and 512)
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"message_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "message_attachments_pk" PRIMARY KEY("message_id","attachment_id"),
	CONSTRAINT "message_attachments_position_nonneg" CHECK ("message_attachments"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "work_submission_attachments" (
	"submission_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "work_submission_attachments_pk" PRIMARY KEY("submission_id","attachment_id"),
	CONSTRAINT "work_submission_attachments_position_nonneg" CHECK ("work_submission_attachments"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_contract_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."contract_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_attachment_id_contract_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."contract_attachments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_submission_attachments" ADD CONSTRAINT "work_submission_attachments_submission_id_contract_work_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."contract_work_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_submission_attachments" ADD CONSTRAINT "work_submission_attachments_attachment_id_contract_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."contract_attachments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_attachments_pathname_uidx" ON "contract_attachments" USING btree ("blob_pathname");--> statement-breakpoint
CREATE INDEX "contract_attachments_contract_created_idx" ON "contract_attachments" USING btree ("contract_address","created_at","id");--> statement-breakpoint
CREATE INDEX "contract_attachments_uploader_status_idx" ON "contract_attachments" USING btree ("uploader_wallet","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_attachments_attachment_uidx" ON "message_attachments" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "message_attachments_message_idx" ON "message_attachments" USING btree ("message_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "work_submission_attachments_attachment_uidx" ON "work_submission_attachments" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "work_submission_attachments_submission_idx" ON "work_submission_attachments" USING btree ("submission_id","position");
