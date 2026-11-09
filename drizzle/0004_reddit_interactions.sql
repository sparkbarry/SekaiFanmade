-- Hand-ordered so likes become upvotes and existing comments become top-level threads.
CREATE TABLE "chart_votes" (
	"chart_id" text NOT NULL,
	"user_id" text NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chart_votes_chart_id_user_id_pk" PRIMARY KEY("chart_id","user_id"),
	CONSTRAINT "chart_votes_value_check" CHECK ("chart_votes"."value" in (-1, 1))
);
--> statement-breakpoint
CREATE TABLE "comment_votes" (
	"comment_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_votes_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id"),
	CONSTRAINT "comment_votes_value_check" CHECK ("comment_votes"."value" in (-1, 1))
);
--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN "upvotes" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN "downvotes" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "chart_votes" ADD CONSTRAINT "chart_votes_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chart_votes" ADD CONSTRAINT "chart_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "chart_votes_user_idx" ON "chart_votes" USING btree ("user_id");
--> statement-breakpoint
-- Every like becomes an upvote.
INSERT INTO "chart_votes" ("chart_id", "user_id", "value", "created_at") SELECT "chart_id", "user_id", 1, "created_at" FROM "chart_likes" ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "charts" c SET "upvotes" = (SELECT count(*) FROM "chart_votes" v WHERE v."chart_id" = c."id" AND v."value" = 1), "downvotes" = (SELECT count(*) FROM "chart_votes" v WHERE v."chart_id" = c."id" AND v."value" = -1);
--> statement-breakpoint
ALTER TABLE "chart_likes" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE "chart_likes" CASCADE;
--> statement-breakpoint
ALTER TABLE "charts" DROP COLUMN "like_count";
--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_votes_check" CHECK ("charts"."upvotes" >= 0 and "charts"."downvotes" >= 0);
--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT "comments_body_check";
--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "body" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "parent_id" bigint;
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "root_id" bigint;
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "depth" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "reply_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "edited_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "removed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "upvotes" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "downvotes" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Existing comments are top-level; deleted ones lose their text; authors upvote their own, as new comments do.
UPDATE "comments" SET "root_id" = "id", "depth" = 0;
--> statement-breakpoint
UPDATE "comments" SET "body" = NULL WHERE "deleted_at" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "comment_votes" ("comment_id", "user_id", "value", "created_at") SELECT "id", "user_id", 1, "created_at" FROM "comments" WHERE "deleted_at" IS NULL ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "comments" c SET "upvotes" = (SELECT count(*) FROM "comment_votes" v WHERE v."comment_id" = c."id" AND v."value" = 1);
--> statement-breakpoint
UPDATE "charts" c SET "comment_count" = (SELECT count(*) FROM "comments" m WHERE m."chart_id" = c."id" AND m."deleted_at" IS NULL AND m."removed_at" IS NULL);
--> statement-breakpoint
CREATE INDEX "comments_root_idx" ON "comments" USING btree ("root_id");
--> statement-breakpoint
CREATE INDEX "comments_user_idx" ON "comments" USING btree ("user_id","created_at");
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_depth_check" CHECK ("comments"."depth" between 0 and 1000);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_votes_check" CHECK ("comments"."upvotes" >= 0 and "comments"."downvotes" >= 0 and "comments"."reply_count" >= 0);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_body_check" CHECK (("comments"."deleted_at" is null and "comments"."removed_at" is null and char_length("comments"."body") between 1 and 10000) or (("comments"."deleted_at" is not null or "comments"."removed_at" is not null) and "comments"."body" is null));
--> statement-breakpoint
-- Comment ranking as on Reddit (same functions as OurTaiko Fanmade 034). "best" is the lower bound of the
-- Wilson score interval at 80% confidence, so a few early votes cannot outrank many.
CREATE FUNCTION comment_confidence(up integer, down integer) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE WHEN up + down = 0 THEN 0 ELSE
  (up::float8 / (up + down) + 1.642374415149 / (2 * (up + down))
   - 1.281551565545 * sqrt((up::float8 / (up + down) * (1 - up::float8 / (up + down)) + 1.642374415149 / (4 * (up + down))) / (up + down)))
  / (1 + 1.642374415149 / (up + down)) END
$$;
--> statement-breakpoint
-- "controversial": many votes, split close to evenly.
CREATE FUNCTION comment_controversy(up integer, down integer) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE WHEN up <= 0 OR down <= 0 THEN 0
  ELSE power((up + down)::float8, CASE WHEN up > down THEN down::float8 / up ELSE up::float8 / down END) END
$$;
