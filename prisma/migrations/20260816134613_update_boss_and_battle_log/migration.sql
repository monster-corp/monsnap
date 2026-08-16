/*
  Warnings:

  - You are about to drop the column `is_critical` on the `battle_logs` table. All the data in the column will be lost.
  - Added the required column `elapsed_ms` to the `battle_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `started_at` to the `battle_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `touch_count` to the `battle_logs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "battle_logs" DROP COLUMN "is_critical",
ADD COLUMN     "battle_type" VARCHAR(30) NOT NULL DEFAULT 'BOSS_TIMED',
ADD COLUMN     "critical_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "elapsed_ms" INTEGER NOT NULL,
ADD COLUMN     "is_cleared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "started_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "touch_count" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "bosses" ADD COLUMN     "time_limit_ms" INTEGER;
