CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"agent" text NOT NULL,
	"prompt" text NOT NULL,
	"steps" jsonb NOT NULL,
	"result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"id" text PRIMARY KEY NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"payee_kind" text NOT NULL,
	"payee_id" text NOT NULL,
	"pattern_id" text,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payout_item_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "designers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"handle" text NOT NULL,
	"paypal_email" text NOT NULL,
	"bio" text,
	"consent_at" timestamp with time zone,
	"demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "designers_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" text PRIMARY KEY NOT NULL,
	"pattern_id" text,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"embedding" real[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" text PRIMARY KEY NOT NULL,
	"pattern_id" text NOT NULL,
	"maker_id" text NOT NULL,
	"match_id" text,
	"units" integer NOT NULL,
	"item_price_cents" integer NOT NULL,
	"rate_bp" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"source" text NOT NULL,
	"paypal_order_id" text,
	"capture_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"captured_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" text PRIMARY KEY NOT NULL,
	"maker_id" text NOT NULL,
	"pattern_id" text NOT NULL,
	"image_id" text,
	"title" text NOT NULL,
	"price_cents" integer NOT NULL,
	"stock" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "makers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"shop_name" text NOT NULL,
	"paypal_email" text NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"maker_id" text,
	"image_id" text NOT NULL,
	"band" text NOT NULL,
	"top_pattern_id" text,
	"candidates" jsonb NOT NULL,
	"traditional_reason" text,
	"verified_by" text NOT NULL,
	"confirmed_pattern_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" text PRIMARY KEY NOT NULL,
	"pattern_id" text NOT NULL,
	"listing_url" text,
	"seller_name" text NOT NULL,
	"seller_email" text NOT NULL,
	"image_id" text,
	"match_score" real,
	"units" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"message" text NOT NULL,
	"invoice_id" text,
	"invoice_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"designer_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"craft" text DEFAULT 'crochet' NOT NULL,
	"license_text" text,
	"sales_allowed" boolean DEFAULT true NOT NULL,
	"credit_required" boolean DEFAULT true NOT NULL,
	"rate_bp" integer DEFAULT 800 NOT NULL,
	"min_cents" integer DEFAULT 100 NOT NULL,
	"batch_limit" integer,
	"parent_id" text,
	"parent_share_bp" integer DEFAULT 0 NOT NULL,
	"features" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_batch_id" text NOT NULL,
	"paypal_batch_id" text,
	"status" text NOT NULL,
	"total_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_batches_sender_batch_id_unique" UNIQUE("sender_batch_id")
);
--> statement-breakpoint
CREATE TABLE "payout_items" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"payee_kind" text NOT NULL,
	"payee_id" text NOT NULL,
	"receiver" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"sender_item_id" text NOT NULL,
	"paypal_item_id" text,
	"status" text NOT NULL,
	CONSTRAINT "payout_items_sender_item_id_unique" UNIQUE("sender_item_id")
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"buyer_note" text,
	"amount_cents" integer NOT NULL,
	"source" text NOT NULL,
	"paypal_order_id" text,
	"capture_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"captured_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"verified" boolean NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patterns" ADD CONSTRAINT "patterns_designer_id_designers_id_fk" FOREIGN KEY ("designer_id") REFERENCES "public"."designers"("id") ON DELETE no action ON UPDATE no action;