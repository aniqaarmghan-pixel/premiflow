CREATE TABLE "account_auth"."wallet_link" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_auth"."wallet_link" ADD CONSTRAINT "wallet_link_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "account_auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_link_wallet_unique" ON "account_auth"."wallet_link" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "wallet_link_user_idx" ON "account_auth"."wallet_link" USING btree ("user_id");