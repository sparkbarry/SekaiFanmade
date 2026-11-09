-- Refuse to drop the legacy keys while a live chart still depends on them (not moved to files yet).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "charts" WHERE "deleted_at" IS NULL AND "package_file_id" IS NULL) THEN
    RAISE EXCEPTION 'charts still on legacy storage keys; let lib/legacy-files.ts (release bb6954e) move them first';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "charts" DROP COLUMN "package_key";--> statement-breakpoint
ALTER TABLE "charts" DROP COLUMN "package_size";--> statement-breakpoint
ALTER TABLE "charts" DROP COLUMN "package_sha256";--> statement-breakpoint
ALTER TABLE "charts" DROP COLUMN "jacket_key";--> statement-breakpoint
ALTER TABLE "charts" DROP COLUMN "audio_key";--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_files_check" CHECK ("charts"."deleted_at" is not null or ("charts"."package_file_id" is not null and "charts"."audio_file_id" is not null));