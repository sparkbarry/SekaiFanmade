ALTER TABLE "charts" DROP CONSTRAINT "charts_files_check";--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN "manifest" jsonb;--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN "score_file_id" bigint;--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN "jacket_source_file_id" bigint;--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN "video_file_id" bigint;--> statement-breakpoint
ALTER TABLE "charts" ADD COLUMN "package_size" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_score_file_id_files_id_fk" FOREIGN KEY ("score_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_jacket_source_file_id_files_id_fk" FOREIGN KEY ("jacket_source_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_video_file_id_files_id_fk" FOREIGN KEY ("video_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_files_check" CHECK ("charts"."deleted_at" is not null or ("charts"."audio_file_id" is not null and ("charts"."package_file_id" is not null or ("charts"."score_file_id" is not null and "charts"."manifest" is not null))));