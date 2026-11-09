CREATE TABLE "chart_likes" (
	"chart_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chart_likes_chart_id_user_id_pk" PRIMARY KEY("chart_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "charts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uploader_id" text NOT NULL,
	"title" text NOT NULL,
	"score_title" text NOT NULL,
	"composer" text DEFAULT '' NOT NULL,
	"lyricist" text DEFAULT '' NOT NULL,
	"arranger" text DEFAULT '' NOT NULL,
	"singer" text DEFAULT '' NOT NULL,
	"collaboration_label" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"difficulty" text NOT NULL,
	"play_level" integer NOT NULL,
	"preview_start_sec" real DEFAULT 0 NOT NULL,
	"has_video" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"package_key" text NOT NULL,
	"package_size" bigint NOT NULL,
	"package_sha256" text NOT NULL,
	"jacket_key" text,
	"audio_key" text NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "charts_difficulty_check" CHECK ("charts"."difficulty" in ('easy','normal','hard','expert','master','append')),
	CONSTRAINT "charts_level_check" CHECK ("charts"."play_level" between 0 and 99)
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chart_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "comments_body_check" CHECK (char_length("comments"."body") between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "retired_objects" (
	"key" text PRIMARY KEY NOT NULL,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"access_expires_at" timestamp with time zone NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"nickname" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"banned_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "chart_likes" ADD CONSTRAINT "chart_likes_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_likes" ADD CONSTRAINT "chart_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chart_likes_user_idx" ON "chart_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "charts_list_idx" ON "charts" USING btree ("created_at" DESC NULLS LAST) WHERE "charts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "charts_uploader_idx" ON "charts" USING btree ("uploader_id");--> statement-breakpoint
CREATE INDEX "comments_chart_idx" ON "comments" USING btree ("chart_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");