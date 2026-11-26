CREATE TYPE "public"."refund_category" AS ENUM('billiard', 'fnb', 'other');--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"category" "refund_category" DEFAULT 'other' NOT NULL,
	"reason" text NOT NULL,
	"restocked" boolean DEFAULT false NOT NULL,
	"external_ref" text,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_externalRef_unique" UNIQUE("external_ref")
);
--> statement-breakpoint
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "venue_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"venue_name" text DEFAULT 'Cue & Tap' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"tax_rate_bps" integer DEFAULT 1000 NOT NULL,
	"service_rate_bps" integer DEFAULT 500 NOT NULL,
	"warning_minutes" integer DEFAULT 15 NOT NULL,
	"receipt_footer" text DEFAULT 'Terima kasih sudah mampir. Sampai jumpa lagi!' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "venue_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "refunded_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "venue_settings" ADD CONSTRAINT "venue_settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "refunds_bill_idx" ON "refunds" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refunds_created_idx" ON "refunds" USING btree ("created_at");