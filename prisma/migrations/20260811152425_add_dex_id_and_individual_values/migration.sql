/*
  Warnings:

  - A unique constraint covering the columns `[dex_id]` on the table `bosses` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[dex_id]` on the table `monsters` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `dex_id` to the `bosses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dex_id` to the `monsters` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "bosses" ADD COLUMN     "dex_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "monsters" ADD COLUMN     "dex_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "user_monsters" ADD COLUMN     "iv_attack" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "iv_defense" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "iv_hp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "iv_speed" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "bosses_dex_id_key" ON "bosses"("dex_id");

-- CreateIndex
CREATE UNIQUE INDEX "monsters_dex_id_key" ON "monsters"("dex_id");
