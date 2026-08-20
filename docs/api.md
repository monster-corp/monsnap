# API 문서

## 공통

### 인증

인증이 필요한 API는 `anon_token` HttpOnly 쿠키로 인증합니다.
`POST /api/users`에서 닉네임을 생성하면 쿠키가 발급됩니다.

### 응답 포맷

```jsonc
{ "code": 20000, "message": "OK", "data": { ... } }
```

`code`의 앞 세 자리가 HTTP 상태 코드입니다.

### 에러 코드 전체 목록

| code    | key                        | message                                                     | HTTP |
|---------|----------------------------|-------------------------------------------------------------|------|
| `20000` | `OK`                       | OK                                                          | 200  |
| `20001` | `FACE_BLOCKED`             | 얼굴이 감지되어 촬영이 차단되었습니다                       | 200  |
| `20002` | `SCREEN_BLOCKED`           | 화면이나 사진 재촬영은 허용되지 않습니다                    | 200  |
| `40000` | `IMAGE_REQUIRED`           | 이미지가 필요합니다                                         | 400  |
| `40001` | `INVALID_NICKNAME`         | 닉네임은 2~12자의 한글/영문/숫자만 가능합니다               | 400  |
| `40002` | `INVALID_REQUEST`          | 요청 형식이 올바르지 않습니다                               | 400  |
| `40003` | `INVALID_IMAGE`            | 지원하지 않는 이미지 형식입니다 (jpeg/png/webp만 가능)      | 400  |
| `40004` | `INVALID_BATTLE_RESULT`    | 전투 결과 검증에 실패했습니다                               | 400  |
| `40100` | `UNAUTHORIZED`             | 세션이 유효하지 않습니다                                    | 401  |
| `40400` | `EGG_NOT_FOUND`            | 해당 알을 찾을 수 없습니다                                  | 404  |
| `40401` | `WALK_SESSION_NOT_FOUND`   | 해당 워크 세션을 찾을 수 없습니다                           | 404  |
| `40402` | `USER_MONSTER_NOT_FOUND`   | 보유하지 않은 몬스터입니다                                  | 404  |
| `40403` | `BOSS_NOT_FOUND`           | 해당 보스를 찾을 수 없습니다                                | 404  |
| `40900` | `EGG_SLOT_FULL`            | 알 보관함이 가득 찼습니다                                   | 409  |
| `40901` | `SESSION_ALREADY_ACTIVE`   | 이미 진행 중인 워크 세션이 있습니다                         | 409  |
| `40902` | `SESSION_NOT_ACTIVE`       | 진행 중인 워크 세션이 아닙니다                              | 409  |
| `40903` | `STEP_COUNT_REGRESSED`     | 이전보다 작은 누적 걸음 수는 전송할 수 없습니다             | 409  |
| `40904` | `EGG_NOT_WALKABLE`         | 걷기가 가능한 상태의 알이 아닙니다                          | 409  |
| `40905` | `EGG_NOT_HATCHABLE`        | 인화(부화)할 수 없는 상태의 알입니다                        | 409  |
| `40906` | `NO_PENDING_IV`            | 확인 대기 중인 개체값이 없습니다                            | 409  |
| `42200` | `INVALID_STEP_COUNT`       | 걸음 수 형식이 올바르지 않습니다                            | 422  |
| `42900` | `SCAN_CHARGE_EMPTY`        | 스캔 충전량이 부족합니다                                    | 429  |
| `42901` | `SCAN_BLOCK_RATE_EXCEEDED` | 차단된 스캔 시도가 너무 많습니다. 잠시 후 다시 시도해주세요 | 429  |
| `50000` | `INTERNAL_ERROR`           | 일시적인 오류가 발생했습니다                                | 500  |
| `50200` | `VLM_FAILED`               | 이미지 분석에 실패했습니다                                  | 502  |
| `50201` | `VLM_RESPONSE_INVALID`     | 분석 결과 형식이 올바르지 않습니다                          | 502  |
| `50400` | `VLM_TIMEOUT`              | 분석 시간이 초과됐습니다                                    | 504  |

> 차단 응답 (`20001`, `20002`)은 요청 자체는 정상 처리된 것으로 보아 HTTP 200으로 반환됩니다.

---

## 엔드포인트

### POST /api/users

닉네임 생성 및 `anon_token` 쿠키 발급.

**Request Body**

```jsonc
{ "nickname": "탐험가" }  // 2~12자, 한글/영문/숫자
```

**Response** `data: null`

---

### GET /api/users

인증된 유저의 프로필 조회.

**Response**

```jsonc
{
  "nickname": "탐험가",
  "scanCharge": {
    "charges": 3,
    "maxCharges": 5,
    "nextChargeAt": "2026-08-20T15:00:00.000Z"  // null 가능
  }
}
```

---

### POST /api/scans

이미지 업로드 → AI 판정 → 알 생성. `multipart/form-data`로 전송.

**Request** `Content-Type: multipart/form-data`

| 필드    | 타입 | 설명              |
|---------|------|-------------------|
| `image` | File | jpeg / png / webp |

**Response (성공)**

```jsonc
{
  "eggId": "123",
  "status": "INCUBATING",
  "requiredSteps": 30,
  "scanCharge": { "charges": 2, "maxCharges": 5, "nextChargeAt": "..." }
}
```

**Response (차단, HTTP 200)**

```jsonc
// code: 20001 또는 20002
{
  "scanId": "456",
  "chargeConsumed": false,
  "scanCharge": { ... }
}
```

---

### GET /api/scans/charge

스캔 충전 상태 조회.

**Response**

```jsonc
{ "charges": 4, "maxCharges": 5, "nextChargeAt": "2026-08-20T18:00:00.000Z" }
```

---

### GET /api/eggs

보유 중인 알 목록 조회.

**Response**

```jsonc
{
  "eggs": [
    {
      "eggId": "1",
      "status": "INCUBATING",
      "currentSteps": 12,
      "requiredSteps": 30,
      "activeWalkSessionId": "7",      // 없으면 null
      "activeWalkSessionSteps": 12,    // 없으면 null
      "cutoutImageUrl": "https://..."
    }
  ]
}
```

---

### POST /api/eggs/{eggId}/walk-sessions

걷기 세션 시작.

**Response**

```jsonc
{
  "sessionId": "7",
  "status": "ACTIVE",
  "startedAt": "2026-08-20T09:00:00.000Z",
  "egg": { "id": "1", "currentSteps": 12, "requiredSteps": 30, "status": "INCUBATING" }
}
```

---

### PATCH /api/eggs/{eggId}/walk-sessions/{sessionId}

걸음 수 동기화. **누적값 (절대치)**으로 전송.

**Request Body**

```jsonc
{ "stepsCaptured": 25 }  // 정수, 0 이상
```

**Response**

```jsonc
{
  "sessionId": "7",
  "stepsCaptured": 25,
  "stepsDelta": 13,
  "egg": {
    "id": "1",
    "currentSteps": 25,
    "requiredSteps": 30,
    "status": "INCUBATING",
    "readyAt": null  // READY 전환 시 ISO 8601
  }
}
```

---

### POST /api/eggs/{eggId}/walk-sessions/{sessionId}/end

걷기 세션 종료.

**Response**

```jsonc
{
  "sessionId": "7",
  "status": "ENDED",
  "stepsCaptured": 30,
  "endedAt": "2026-08-20T10:30:00.000Z"
}
```

---

### POST /api/eggs/{eggId}/hatch

인화 (부화). `status === READY`인 알에만 가능.

**Response**

```jsonc
{
  "egg": { "id": "1", "status": "HATCHED", "hatchedAt": "2026-08-20T10:31:00.000Z" },
  "monster": {
    "id": "5",
    "dexId": 12,
    "name": "블레이즈컵",
    "rarity": "RARE",
    "material": "CERAMIC",
    "shape": "ROUND",
    "imageUrl": "https://..."
  },
  "userMonster": { "id": "3", "monsterId": "5", "catchCount": 1, "level": 1 },
  "isNewMonster": true,
  "currentStats": { "hp": 88, "attack": 65, "defense": 72, "speed": 50, "totalIv": 8 },
  "rolledIv": { "ivHp": 5, "ivAttack": -2, "ivDefense": 3, "ivSpeed": 2 },
  "rolledStats": { "hp": 88, "attack": 65, "defense": 72, "speed": 50, "totalIv": 8 }
}
```

---

### GET /api/monsters

도감 조회 (수집 여부와 무관한 전체 몬스터).

**Response**

```jsonc
{
  "totalCount": 31,
  "caughtCount": 8,
  "monsters": [
    {
      "monsterId": "5",
      "dexId": 12,
      "name": "블레이즈컵",
      "rarity": "RARE",
      "caught": true,
      "material": "CERAMIC",     // 미수집 시 없음
      "shape": "ROUND",          // 미수집 시 없음
      "imageUrl": "https://...", // 미수집 시 없음
      "baseStats": { "hp": 84, "attack": 66, "defense": 70, "speed": 48 }  // 미수집 시 없음
    }
  ]
}
```

정렬: `EPIC → RARE → COMMON`, 같은 희귀도 내 `dexId` 오름차순.

---

### GET /api/user-monsters

보유 몬스터 목록. `?sort=dexId&order=asc` 쿼리 파라미터 지원.

**Query Parameters**

| 파라미터 | 값                                    | 설명                      |
|----------|---------------------------------------|---------------------------|
| `sort`   | `dexId` \| `level` \| `firstCaughtAt` | 정렬 기준 (기본: `dexId`) |
| `order`  | `asc` \| `desc`                       | 정렬 방향 (기본: `asc`)   |

**Response**

```jsonc
{
  "sort": ["dexId"],
  "order": ["asc"],
  "userMonsters": [
    {
      "userMonsterId": "3",
      "monsterId": "5",
      "dexId": 12,
      "name": "블레이즈컵",
      "rarity": "RARE",
      "material": "CERAMIC",
      "shape": "ROUND",
      "imageUrl": "https://...",
      "cutoutImageUrl": "https://...",
      "level": 1,
      "catchCount": 2,
      "firstCaughtAt": "2026-08-15T07:00:00.000Z",
      "baseStats": { "hp": 84, "attack": 66, "defense": 70, "speed": 48 },
      "currentStats": { "hp": 88, "attack": 65, "defense": 72, "speed": 50, "totalIv": 8 },
      "pendingIv": { "ivHp": -3, "ivAttack": 7, "ivDefense": -1, "ivSpeed": 4 },  // 없으면 null
      "pendingStats": { "hp": 81, "attack": 71, "defense": 69, "speed": 50, "totalIv": 7 }  // 없으면 null
    }
  ]
}
```

---

### POST /api/user-monsters/{userMonsterId}/iv

대기 중인 개체값 채택 또는 거부.

**Request Body**

```jsonc
{ "decision": "accept" }  // "accept" | "reject"
```

**Response**

```jsonc
{
  "userMonsterId": "3",
  "accepted": true,
  "currentStats": { "hp": 81, "attack": 71, "defense": 69, "speed": 50, "totalIv": 7 }
}
```

---

### GET /api/bosses/{dexId}

활성화된 보스 정보 조회.

**Response**

```jsonc
{
  "id": "1",
  "dexId": 99,
  "name": "그랜드슬램",
  "hp": 1200,
  "timeLimitMs": 30000,
  "weakAttribute": "WATER",
  "strongAttribute": "FIRE",
  "imageUrl": "https://...",
  "cutoutImageUrl": "https://...",  // null 가능
  "bgImageUrl": "https://..."       // null 가능
}
```

---

### POST /api/bosses/{dexId}

전투 결과 제출. 서버가 시간·터치·크리티컬을 검증합니다.

**Request Body**

```jsonc
{
  "userMonsterId": "3",
  "touchCount": 45,
  "criticalCount": 8,
  "elapsedMs": 28500
}
```

**Response**

```jsonc
{
  "battleLogId": "42",
  "isCleared": true,
  "damageDealt": 3900,
  "bossHpRemaining": 0,
  "damageMultiplier": 1.5
}
```

---

### GET /api/missions

미션 진행도 조회.

**Response**

```jsonc
{
  "totalCount": 7,
  "completedCount": 3,
  "missions": [
    {
      "missionId": "1",
      "code": "DAILY_SCAN_3",
      "title": "사물 탐색가",
      "description": "오늘 3번 촬영하세요",
      "cycle": "DAILY",
      "conditionType": "SCAN_COUNT",
      "progress": 2,
      "targetCount": 3,
      "completed": false,
      "completedAt": null,
      "claimedAt": null,
      "periodEndsAt": "2026-08-21T20:00:00.000Z"
    }
  ]
}
```