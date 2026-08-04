-- AlterTable
ALTER TABLE "scans"
    ADD COLUMN "is_screen" BOOLEAN NOT NULL DEFAULT false;

-- 기존 CHECK 제약 제거
ALTER TABLE "scans" DROP CONSTRAINT "scans_check";

-- 새 CHECK 제약 추가 (is_screen 포함)
ALTER TABLE "scans"
    ADD CONSTRAINT "scans_block_material_shape_check" CHECK (
        ((is_face_blocked = true OR is_screen = true) AND material IS NULL AND shape IS NULL) OR
        (is_face_blocked = false AND is_screen = false AND material IS NOT NULL AND shape IS NOT NULL)
        );