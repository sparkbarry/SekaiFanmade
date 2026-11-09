-- Every chart must already be split into its parts (0005's start-up job); otherwise stop and roll back.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "charts" WHERE "package_file_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'charts still stored as ZIPs: run the 0005 release first';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "charts" DROP CONSTRAINT "charts_files_check";--> statement-breakpoint
ALTER TABLE "charts" DROP CONSTRAINT "charts_package_file_id_files_id_fk";
--> statement-breakpoint
ALTER TABLE "charts" DROP COLUMN "package_file_id";--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_files_check" CHECK ("charts"."deleted_at" is not null or ("charts"."score_file_id" is not null and "charts"."audio_file_id" is not null and "charts"."manifest" is not null));