-- CreateDomain
CREATE DOMAIN block_reason_domain AS VARCHAR(20)
    CHECK (VALUE IN ('NONE', 'FACE', 'SCREEN'));

-- AlterTable
ALTER TABLE "scans" DROP CONSTRAINT "scans_block_material_shape_check";

-- AlterTable
ALTER TABLE "scans" DROP COLUMN "is_face_blocked",
                    DROP COLUMN "is_screen",
                    ADD COLUMN     "block_reason" block_reason_domain NOT NULL DEFAULT 'NONE';

-- 새 CHECK 추가
ALTER TABLE "scans" ADD CONSTRAINT "scans_block_reason_material_shape_check" CHECK (
    (block_reason != 'NONE' AND material IS NULL AND shape IS NULL) OR
    (block_reason = 'NONE' AND material IS NOT NULL AND shape IS NOT NULL)
    );