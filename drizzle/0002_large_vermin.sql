CREATE TYPE "public"."deposit_status" AS ENUM('none', 'pending', 'paid', 'refunded', 'forfeited');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."waitlist_status" AS ENUM('waiting', 'called', 'seated', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"table_id" uuid NOT NULL,
	"guest_name" text NOT NULL,
	"phone" text,
	"party_size" integer DEFAULT 2 NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "reservation_status" DEFAULT 'pending' NOT NULL,
	"deposit_amount" integer DEFAULT 0 NOT NULL,
	"deposit_status" "deposit_status" DEFAULT 'none' NOT NULL,
	"note" text,
	"bill_id" uuid,
	"session_id" uuid,
	"created_by" uuid,
	"checked_in_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "table_rate_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"rate_id" uuid NOT NULL,
	"days_of_week" jsonb DEFAULT '[1,2,3,4,5,6,7]'::jsonb NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "table_rate_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"guest_name" text NOT NULL,
	"phone" text,
	"party_size" integer DEFAULT 2 NOT NULL,
	"preference" "table_kind" DEFAULT 'billiard' NOT NULL,
	"status" "waitlist_status" DEFAULT 'waiting' NOT NULL,
	"estimated_wait_minutes" integer DEFAULT 15 NOT NULL,
	"note" text,
	"created_by" uuid,
	"called_at" timestamp with time zone,
	"seated_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_id_venue_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."venue_tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_session_id_billiard_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."billiard_sessions"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "table_rate_schedules" ADD CONSTRAINT "table_rate_schedules_table_id_venue_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."venue_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_rate_schedules" ADD CONSTRAINT "table_rate_schedules_rate_id_billiard_rates_id_fk" FOREIGN KEY ("rate_id") REFERENCES "public"."billiard_rates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "reservations_start_idx" ON "reservations" USING btree ("start_at","status");--> statement-breakpoint
CREATE INDEX "reservations_table_idx" ON "reservations" USING btree ("table_id","start_at");--> statement-breakpoint
CREATE INDEX "table_rate_schedules_table_idx" ON "table_rate_schedules" USING btree ("table_id","active");--> statement-breakpoint
CREATE INDEX "table_rate_schedules_rate_idx" ON "table_rate_schedules" USING btree ("rate_id");--> statement-breakpoint
CREATE INDEX "waitlist_status_idx" ON "waitlist_entries" USING btree ("status","created_at");