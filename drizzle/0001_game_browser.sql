CREATE TABLE "bookmarks" (
	"chart_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmarks_chart_id_user_id_pk" PRIMARY KEY("chart_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "chart_plays" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chart_id" bigint NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN "allow_derivative" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN "parent_chart_id" bigint;--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN "play_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_plays" ADD CONSTRAINT "chart_plays_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookmarks_user_idx" ON "bookmarks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "chart_plays_chart_idx" ON "chart_plays" USING btree ("chart_id","created_at");--> statement-breakpoint
CREATE INDEX "chart_plays_time_idx" ON "chart_plays" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_parent_chart_id_charts_id_fk" FOREIGN KEY ("parent_chart_id") REFERENCES "public"."charts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charts_tags_idx" ON "charts" USING gin ("tags");--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_tags_check" CHECK (cardinality("charts"."tags") <= 8);