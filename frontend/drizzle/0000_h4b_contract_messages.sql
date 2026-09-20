CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"nonce_hash" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contract_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_address" text NOT NULL,
	"sender_wallet" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "contract_messages_body_len" CHECK (char_length("body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "rate_limit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bucket" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"wallet_address" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "thread_reads" (
	"contract_address" text NOT NULL,
	"wallet_address" text NOT NULL,
	"last_read_message_id" uuid,
	"last_read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "thread_reads_pk" PRIMARY KEY("contract_address","wallet_address")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_challenges_nonce_hash_uidx" ON "auth_challenges" USING btree ("nonce_hash");--> statement-breakpoint
CREATE INDEX "auth_challenges_wallet_created_idx" ON "auth_challenges" USING btree ("wallet_address","created_at");--> statement-breakpoint
CREATE INDEX "auth_challenges_expires_idx" ON "auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "contract_messages_thread_idx" ON "contract_messages" USING btree ("contract_address","created_at","id");--> statement-breakpoint
CREATE INDEX "rate_limit_events_bucket_created_idx" ON "rate_limit_events" USING btree ("bucket","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uidx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_wallet_idx" ON "sessions" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");
