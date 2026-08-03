-- CreateDomain
CREATE DOMAIN material_domain AS VARCHAR(20)
    CHECK (VALUE IN ('NORMAL', 'FIRE', 'WATER', 'GRASS', 'METAL', 'CERAMIC', 'GLASS', 'PLASTIC', 'ELECTRIC'));

-- CreateDomain
CREATE DOMAIN shape_domain AS VARCHAR(20) CHECK (VALUE IN ('FREEFORM', 'ROUND', 'TRIANGLE', 'SQUARE', 'LONG'));

-- CreateDomain
CREATE DOMAIN rarity_domain AS VARCHAR(20) CHECK (VALUE IN ('COMMON', 'RARE', 'EPIC'));

-- CreateDomain
CREATE DOMAIN egg_status_domain AS VARCHAR(20) CHECK (VALUE IN ('INCUBATING', 'READY', 'HATCHED'));

-- CreateDomain
CREATE DOMAIN walk_session_status_domain AS VARCHAR(20) CHECK (VALUE IN ('ACTIVE', 'ENDED'));

-- CreateDomain
CREATE DOMAIN walk_session_end_reason_domain AS VARCHAR(20) CHECK (VALUE IN ('STEP_GOAL_REACHED', 'USER_EXIT', 'BACKGROUNDED', 'TIMEOUT'));

-- CreateTable
CREATE TABLE "users"
(
    "id"         BIGSERIAL    NOT NULL,
    "nickname"   VARCHAR(50)  NOT NULL CHECK (length(trim("nickname")) >= 2 AND length(trim("nickname")) <= 12),
    "anon_token" UUID         NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monsters"
(
    "id"           BIGSERIAL       NOT NULL,
    "name"         VARCHAR(100)    NOT NULL,
    "rarity"       rarity_domain   NOT NULL,
    "material"     material_domain NOT NULL,
    "shape"        shape_domain    NOT NULL,
    "drop_weight"  INTEGER         NOT NULL CHECK ( "drop_weight" > 0 ),
    "base_hp"      INTEGER         NOT NULL CHECK ( "base_hp" > 0 ),
    "base_attack"  INTEGER         NOT NULL CHECK ( "base_attack" > 0 ),
    "base_defense" INTEGER         NOT NULL CHECK ( "base_defense" > 0 ),
    "base_speed"   INTEGER         NOT NULL CHECK ( "base_speed" > 0 ),
    "image_url"    TEXT            NOT NULL,
    "is_fallback"  BOOLEAN         NOT NULL DEFAULT false,
    "created_at"   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monsters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rarity_step_requirements"
(
    "rarity"         rarity_domain NOT NULL,
    "required_steps" INTEGER       NOT NULL CHECK ( "required_steps" > 0 ),
    "updated_at"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rarity_step_requirements_pkey" PRIMARY KEY ("rarity")
);

-- CreateTable
CREATE TABLE "scans"
(
    "id"                   BIGSERIAL    NOT NULL,
    "user_id"              BIGINT       NOT NULL,
    "extracted_attributes" JSONB        NOT NULL,
    "material"             material_domain,
    "shape"                shape_domain,
    "similarity_score"     DECIMAL(5, 2) CHECK ( "similarity_score" >= 0 ),
    "is_face_blocked"      BOOLEAN      NOT NULL DEFAULT false,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id"),
    CHECK (
        ("is_face_blocked" = true AND "material" IS NULL AND "shape" IS NULL) OR
        ("is_face_blocked" = false AND "material" IS NOT NULL AND "shape" IS NOT NULL)
        )
);

-- CreateTable
CREATE TABLE "eggs"
(
    "id"             BIGSERIAL         NOT NULL,
    "user_id"        BIGINT            NOT NULL,
    "scan_id"        BIGINT            NOT NULL,
    "monster_id"     BIGINT            NOT NULL,
    "required_steps" INTEGER           NOT NULL CHECK ( "required_steps" > 0 ),
    "current_steps"  INTEGER           NOT NULL DEFAULT 0 CHECK ( "current_steps" >= 0 ),
    "status"         egg_status_domain NOT NULL DEFAULT 'INCUBATING',
    "created_at"     TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at"       TIMESTAMP(3),
    "hatched_at"     TIMESTAMP(3),

    CONSTRAINT "eggs_pkey" PRIMARY KEY ("id"),
    CHECK ( "current_steps" <= "required_steps" ),
    CHECK (
        ("status" = 'INCUBATING' AND "ready_at" IS NULL AND "hatched_at" IS NULL) OR
        ("status" = 'READY' AND "ready_at" IS NOT NULL AND "hatched_at" IS NULL) OR
        ("status" = 'HATCHED' AND "ready_at" IS NOT NULL AND "hatched_at" IS NOT NULL)
        )
);

-- CreateTable
CREATE TABLE "egg_walk_sessions"
(
    "id"             BIGSERIAL                  NOT NULL,
    "egg_id"         BIGINT                     NOT NULL,
    "user_id"        BIGINT                     NOT NULL,
    "started_at"     TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at"       TIMESTAMP(3),
    "steps_captured" INTEGER                    NOT NULL DEFAULT 0 CHECK ("steps_captured" >= 0),
    "end_reason"     walk_session_end_reason_domain,
    "status"         walk_session_status_domain NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "egg_walk_sessions_pkey" PRIMARY KEY ("id"),
    CHECK (
        ("status" = 'ACTIVE' AND "ended_at" IS NULL AND "end_reason" IS NULL) OR
        ("status" = 'ENDED' AND "ended_at" IS NOT NULL AND "end_reason" IS NOT NULL)
        )
);

-- CreateTable
CREATE TABLE "user_monsters"
(
    "id"              BIGSERIAL    NOT NULL,
    "user_id"         BIGINT       NOT NULL,
    "monster_id"      BIGINT       NOT NULL,
    "egg_id"          BIGINT,
    "catch_count"     INTEGER      NOT NULL DEFAULT 1 CHECK ("catch_count" >= 1),
    "level"           INTEGER      NOT NULL DEFAULT 1 CHECK ("level" >= 1),
    "first_caught_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_monsters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bosses"
(
    "id"               BIGSERIAL    NOT NULL,
    "name"             VARCHAR(100) NOT NULL,
    "image_url"        TEXT         NOT NULL,
    "hp"               INTEGER      NOT NULL CHECK ("hp" > 0),
    "weak_attribute"   material_domain,
    "strong_attribute" material_domain,
    "is_active"        BOOLEAN      NOT NULL DEFAULT true,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bosses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "battle_logs"
(
    "id"                BIGSERIAL     NOT NULL,
    "user_id"           BIGINT        NOT NULL,
    "boss_id"           BIGINT        NOT NULL,
    "user_monster_id"   BIGINT        NOT NULL,
    "damage_multiplier" DECIMAL(4, 2) NOT NULL DEFAULT 1.0 CHECK ("damage_multiplier" >= 0),
    "damage_dealt"      INTEGER       NOT NULL CHECK ("damage_dealt" >= 0),
    "is_critical"       BOOLEAN       NOT NULL DEFAULT false,
    "boss_hp_remaining" INTEGER       NOT NULL CHECK ("boss_hp_remaining" >= 0),
    "created_at"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_anon_token_key" ON "users" ("anon_token");

-- CreateIndex
CREATE INDEX "monsters_material_shape_idx" ON "monsters" ("material", "shape");

-- CreateIndex
CREATE INDEX "scans_user_id_idx" ON "scans" ("user_id");

-- CreateIndex
CREATE INDEX "scans_material_shape_idx" ON "scans" ("material", "shape");

-- CreateIndex
CREATE INDEX "scans_created_at_idx" ON "scans" ("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "eggs_scan_id_key" ON "eggs" ("scan_id");

-- CreateIndex
CREATE INDEX "eggs_user_id_status_idx" ON "eggs" ("user_id", "status");

-- CreateIndex
CREATE INDEX "egg_walk_sessions_egg_id_idx" ON "egg_walk_sessions" ("egg_id");

-- CreateIndex
CREATE UNIQUE INDEX "egg_walk_sessions_one_active_per_user"
    ON "egg_walk_sessions" ("user_id")
    WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "user_monsters_user_id_monster_id_key" ON "user_monsters" ("user_id", "monster_id");

-- CreateIndex
CREATE INDEX "user_monsters_user_id_idx" ON "user_monsters" ("user_id");

-- CreateIndex
CREATE INDEX "battle_logs_user_id_idx" ON "battle_logs" ("user_id");

-- CreateIndex
CREATE INDEX "battle_logs_created_at_idx" ON "battle_logs" ("created_at");

-- AddForeignKey
ALTER TABLE "scans"
    ADD CONSTRAINT "scans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eggs"
    ADD CONSTRAINT "eggs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eggs"
    ADD CONSTRAINT "eggs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eggs"
    ADD CONSTRAINT "eggs_monster_id_fkey" FOREIGN KEY ("monster_id") REFERENCES "monsters" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "egg_walk_sessions"
    ADD CONSTRAINT "egg_walk_sessions_egg_id_fkey" FOREIGN KEY ("egg_id") REFERENCES "eggs" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "egg_walk_sessions"
    ADD CONSTRAINT "egg_walk_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_monsters"
    ADD CONSTRAINT "user_monsters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_monsters"
    ADD CONSTRAINT "user_monsters_monster_id_fkey" FOREIGN KEY ("monster_id") REFERENCES "monsters" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_monsters"
    ADD CONSTRAINT "user_monsters_egg_id_fkey" FOREIGN KEY ("egg_id") REFERENCES "eggs" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_logs"
    ADD CONSTRAINT "battle_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_logs"
    ADD CONSTRAINT "battle_logs_boss_id_fkey" FOREIGN KEY ("boss_id") REFERENCES "bosses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_logs"
    ADD CONSTRAINT "battle_logs_user_monster_id_fkey" FOREIGN KEY ("user_monster_id") REFERENCES "user_monsters" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;