CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recipient_wallet" text NOT NULL,
	"type" text NOT NULL,
	"contract_address" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"payload" jsonb,
	"unique_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_type_enum" CHECK ("notifications"."type" in (
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
        'deadline_warning'
      )),
	CONSTRAINT "notifications_title_len" CHECK (char_length("notifications"."title") between 1 and 200),
	CONSTRAINT "notifications_body_len" CHECK (char_length("notifications"."body") between 1 and 2000),
	CONSTRAINT "notifications_unique_key_len" CHECK (char_length("notifications"."unique_key") between 1 and 200),
	CONSTRAINT "notifications_href_len" CHECK ("notifications"."href" is null or char_length("notifications"."href") between 1 and 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_recipient_unique_key_uidx" ON "notifications" USING btree ("recipient_wallet","unique_key");--> statement-breakpoint
CREATE INDEX "notifications_recipient_read_created_idx" ON "notifications" USING btree ("recipient_wallet","read_at","created_at");
