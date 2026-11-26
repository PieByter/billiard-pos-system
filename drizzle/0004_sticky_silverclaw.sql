CREATE TYPE "public"."payment_intent_status" AS ENUM('pending', 'paid', 'expired', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_order_id" text NOT NULL,
	"provider_ref" text,
	"amount" integer NOT NULL,
	"status" "payment_intent_status" DEFAULT 'pending' NOT NULL,
	"qr_string" text,
	"qr_url" text,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"raw_payload" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_intents_providerOrderId_unique" UNIQUE("provider_order_id")
);
--> statement-breakpoint
ALTER TABLE "payment_intents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "payment_intents_bill_idx" ON "payment_intents" USING btree ("bill_id","status");--> statement-breakpoint
CREATE INDEX "payment_intents_status_idx" ON "payment_intents" USING btree ("status","created_at");