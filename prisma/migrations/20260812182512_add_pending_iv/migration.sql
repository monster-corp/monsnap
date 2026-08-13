-- AlterTable
ALTER TABLE "user_monsters" ADD COLUMN     "pending_iv_attack" INTEGER,
ADD COLUMN     "pending_iv_defense" INTEGER,
ADD COLUMN     "pending_iv_hp" INTEGER,
ADD COLUMN     "pending_iv_speed" INTEGER;
