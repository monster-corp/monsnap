# 게임 시스템 문서

## 목차

1. [Scan & Matching](#1-scan--matching)
2. [Scan Charge](#2-scan-charge)
3. [Egg](#3-egg)
4. [Walk Session](#4-walk-session)
5. [Hatch & IV](#5-hatch--iv)
6. [Boss Battle](#6-boss-battle)
7. [Missions](#7-missions)

---

## 1. Scan & Matching

### AI 판정 속성

| 카테고리 | 값                                                                             |
|----------|--------------------------------------------------------------------------------|
| Material | `NORMAL` `FIRE` `WATER` `GRASS` `METAL` `CERAMIC` `GLASS` `PLASTIC` `ELECTRIC` |
| Shape    | `FREEFORM` `ROUND` `TRIANGLE` `SQUARE` `LONG`                                  |

출처: `lib/schemas/vlm.ts`의 `MATERIAL_VALUES`, `SHAPE_VALUES`

### 매칭 규칙

- AI가 반환한 `confidence`가 70.00 미만이면 즉시 폴백 (`lib/matching.ts: CONFIDENCE_THRESHOLD`)
- confidence가 70.00 이상이면 material과 shape가 정확히 일치하는 몬스터 중 **가중치 랜덤** 추첨:
  ```sql
  ORDER BY -ln(random()) / drop_weight LIMIT 1
  ```
- 해당 조합에 등록된 몬스터가 없으면 폴백

> **시딩 현황 (참고)**: 45개 조합 (9 × 5) 중 24개에만 실제 몬스터가 등록되어 있음. 폴백 몬스터는 dexId 32 "버기" 1종.

### 차단 (Block)

- VLM이 `block_reason`을 판정: `NONE`(정상) / `FACE`(얼굴·신체) / `SCREEN`(화면·재촬영)
- 차단 시 HTTP 200으로 응답하되 `code`가 `20001`(얼굴) 또는 `20002`(화면)로 구분됨
- **차단 유예**: `BLOCK_GRACE = 2` — 연속 차단 1~2회는 충전을 소모하지 않음, 3회째부터 소모 (`lib/scans.ts`)
- **시간당 차단 상한**: 1시간 이내 15회 초과 시 `SCAN_BLOCK_RATE_EXCEEDED(42901)` 반환 (`lib/scan-charge.ts: HOURLY_BLOCK_LIMIT`)

---

## 2. Scan Charge

| 상수                 | 값                           | 출처                 |
|----------------------|------------------------------|----------------------|
| `MAX_CHARGES`        | `5`                          | `lib/scan-charge.ts` |
| `CHARGE_INTERVAL_MS` | `3 * 60 * 60 * 1000` (3시간) | `lib/scan-charge.ts` |

### 충전 공식

```
earned = floor((now - lastChargedAt) / 3h)
```

- `lastChargedAt`은 충전이 실제로 발생한 시점으로만 전진 — **부분 진행 유실 방지**
- 이미 `MAX_CHARGES`에 도달한 경우 충전 계산 없이 `lastChargedAt`을 현재 시각으로 갱신

---

## 3. Egg

| 상수              | 값                        | 출처          |
|-------------------|---------------------------|---------------|
| `MAX_ACTIVE_EGGS` | `3` (HATCHED 제외 카운트) | `lib/eggs.ts` |

### 희귀도별 요구 걸음 수

| 희귀도 | 요구 걸음 수 |
|--------|--------------|
| COMMON | 100          |
| RARE   | 150          |
| EPIC   | 200          |

출처: `prisma/seed.ts`의 `rarityStepRequirements`

> **참고**: 현재 값(개발·테스트용)

---

## 4. Walk Session

### 핵심 규칙

- **유저당 활성 세션 1개** — DB partial unique index (`egg_walk_sessions_one_active_per_user WHERE status='ACTIVE'`) + 애플리케이션 체크
  이중 보장 + `P2002` 캐치
- **걸음 전송 방식**: 누적값 (절대치) 전송. 서버가 이전 값보다 작으면 `STEP_COUNT_REGRESSED(40903)` 반환
- **트랜잭션**: Serializable 격리 — 동시 PATCH 요청이 걸음 수를 덮어쓰지 않도록 보장
- **자동 만료**: `lastActiveAt`이 `WALK_SESSION_TIMEOUT_MS = 6 * 60 * 60 * 1000`(6시간)을 초과하면 방치 세션으로 처리
- **`lastActiveAt` 갱신 조건**: 걸음이 실제로 증가한 PATCH에서만 갱신 (프론트 호출 주기와 무관)

### 목표 도달 시 동작

목표 걸음 도달 시 Egg만 `READY`로 전환하며 세션은 자동 종료되지 않는다.
일반 클라이언트 흐름에서는 목표 달성 직후 세션을 별도로 종료할 수 없으며, 부화(인화) 시 `POST /end`를 호출해 세션을 종료한 후 확인한다.

---

## 5. Hatch & IV

### IV (개체값) 생성

- 스탯별 독립 랜덤: -10 ~ +10% 정수 (`lib/stats.ts: generateRandomIVs`)
- 대상 스탯: `hp`, `attack`, `defense`, `speed` 4개

### 최종 스탯 공식

```
final = max(1, floor(base × (1 + iv / 100)))
```

출처: `lib/stats.ts: calculateFinalStats`

### 최초 포획 vs 중복 포획

| 경우      | 동작                                                       |
|-----------|------------------------------------------------------------|
| 최초 포획 | IV 즉시 확정 적용                                          |
| 중복 포획 | `pendingIv*` 컬럼에 제안만 저장, 유저가 accept/reject 결정 |

- 서버는 IV 총합으로 우열을 판정하지 않음 — 스탯의 역할 (공격형·방어형)에 따라 가치가 다르므로 유저에게 결정권을 줌

> **참고**: `shape`는 매칭에만 사용되며 스탯에는 영향을 주지 않음

---

## 6. Boss Battle

### 시간 제한

| 상수                    | 값             | 출처            |
|-------------------------|----------------|-----------------|
| `DEFAULT_TIME_LIMIT_MS` | `30000` (30초) | `lib/bosses.ts` |
| `TIME_LIMIT_BUFFER_MS`  | `500` (0.5초)  | `lib/bosses.ts` |

보스 데이터에 `timeLimitMs`가 있으면 해당 값 사용, 없으면 기본값 30초.

### 데미지 계산

```
normalDamage   = normalTouches × (attack × multiplier)
criticalDamage = criticalTouches × (attack × multiplier × 1.5)
totalDamage    = round(normalDamage + criticalDamage)
```

### 상성 배율

| 조건                         | 배율 |
|------------------------------|------|
| 보스 약점 재질 = 몬스터 재질 | 1.5  |
| 보스 강점 재질 = 몬스터 재질 | 0.5  |
| 그 외                        | 1.0  |

### 서버 검증 3가지

1. `criticalCount ≤ touchCount`
2. `elapsedMs ≤ timeLimitMs + 500`
3. `touchCount ≤ ceil(effectiveElapsedSec × 15) + 3` (초당 15터치 + 3 여유)

검증 실패 시 `INVALID_BATTLE_RESULT(40004)` 반환.

> **알려진 제약**: 동일 전투 결과를 재제출하는 것을 막는 멱등성 장치가 없음 — 같은 결과를 여러 번 보내면 `BattleLog` 레코드가 중복 생성됨.

---

## 7. Missions

### 리셋 기준

| 주기 | 리셋 시각        |
|------|------------------|
| 일일 | KST 05:00        |
| 주간 | KST 월요일 05:00 |

출처: `lib/period.ts: RESET_HOUR_MS = 5 * 60 * 60 * 1000`

### 조건 타입

| 타입                  | 설명                      |
|-----------------------|---------------------------|
| `SCAN_COUNT`          | 촬영 횟수                 |
| `WALK_SESSION_COUNT`  | 걷기 세션 시작 횟수       |
| `TOTAL_STEPS`         | 누적 걸음 수              |
| `DEX_REGISTER_COUNT`  | 도감 등록 수              |
| `DAILY_MISSION_CLEAR` | 일일 미션 완료 수         |
| `HATCH_IN_TIME_RANGE` | 특정 시간대(낮/밤)에 부화 |
| `SCAN_WITH_ATTRIBUTE` | 지정 속성 몬스터 스캔     |

출처: `lib/missions.ts: ConditionType`

- 미션 진행도를 매 요청마다 DB에 기록하지 않고, 조회/처리 시 현재 누적 데이터를 기준으로 완료 여부를 계산한 뒤 최초 완료 시 `completedAt`만 기록한다.

> **알려진 제약**: `claimedAt` 컬럼은 스키마에 존재하나 실제로 채워주는 코드가 없음 — 보상 수령 (claim) 플로우는 미구현.