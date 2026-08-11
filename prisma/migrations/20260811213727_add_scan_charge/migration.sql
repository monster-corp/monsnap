-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_charged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "scan_charges" INTEGER NOT NULL DEFAULT 5;

-- CreateIndex
CREATE INDEX "scans_user_id_created_at_idx" ON "scans"("user_id", "created_at");
