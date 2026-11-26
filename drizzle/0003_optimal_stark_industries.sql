CREATE TYPE "public"."bill_split_item_type" AS ENUM('order_item', 'session');--> statement-breakpoint
CREATE TYPE "public"."bill_split_status" AS ENUM('open', 'paid', 'void');--> statement-breakpoint
CREATE TABLE "bill_split_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"split_id" uuid NOT NULL,
	"item_type" "bill_split_item_type" NOT NULL,
	"order_item_id" uuid,
	"session_id" uuid,
	"amount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bill_split_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bill_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"label" text NOT NULL,
	"status" "bill_split_status" DEFAULT 'open' NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"discount_amount" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"service_amount" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bill_splits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "bill_split_id" uuid;--> statement-breakpoint
ALTER TABLE "bill_split_items" ADD CONSTRAINT "bill_split_items_split_id_bill_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."bill_splits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_split_items" ADD CONSTRAINT "bill_split_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "bill_split_items" ADD CONSTRAINT "bill_split_items_session_id_billiard_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."billiard_sessions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "bill_splits" ADD CONSTRAINT "bill_splits_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_splits" ADD CONSTRAINT "bill_splits_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "bill_split_items_split_idx" ON "bill_split_items" USING btree ("split_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_split_items_order_unique" ON "bill_split_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_split_items_session_unique" ON "bill_split_items" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "bill_splits_bill_idx" ON "bill_splits" USING btree ("bill_id","status");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bill_split_id_bill_splits_id_fk" FOREIGN KEY ("bill_split_id") REFERENCES "public"."bill_splits"("id") ON DELETE set null ON UPDATE no action;