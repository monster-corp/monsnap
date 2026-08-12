-- CreateTable
CREATE TABLE "missions" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "cycle" VARCHAR(20) NOT NULL,
    "condition_type" VARCHAR(50) NOT NULL,
    "target_count" INTEGER NOT NULL,
    "condition_meta" JSONB,
    "reward_type" VARCHAR(50),
    "reward_amount" INTEGER,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_missions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "mission_id" BIGINT NOT NULL,
    "period_key" VARCHAR(20) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_missions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "missions_code_key" ON "missions"("code");

-- CreateIndex
CREATE INDEX "user_missions_user_id_period_key_idx" ON "user_missions"("user_id", "period_key");

-- CreateIndex
CREATE INDEX "user_missions_user_id_completed_at_idx" ON "user_missions"("user_id", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_missions_user_id_mission_id_period_key_key" ON "user_missions"("user_id", "mission_id", "period_key");

-- CreateIndex
CREATE INDEX "egg_walk_sessions_user_id_started_at_idx" ON "egg_walk_sessions"("user_id", "started_at");

-- AddForeignKey
ALTER TABLE "user_missions" ADD CONSTRAINT "user_missions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_missions" ADD CONSTRAINT "user_missions_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
