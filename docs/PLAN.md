# FC EXICAN 운영 허브 — 설계 문서

> 원본: Claude Code 플랜 (2026-10-14). 발주서는 `docs/tasks/`에, 작업 규약은 `AGENTS.md`에 있습니다.


## Context

FC EXICAN(12명)은 매주 토요일 오전 풋살을 진행한다. 회장이 매주 (1) 카톡 투표로 참석 인원 확정 → (2) 네이버 카페 '모두의풋살' 풋매 게시판 4곳(서울남동/서울북동/남양주·구리/성남·하남)을 눈으로 훑어 토요일 오전 미마감 글을 찾고 → (3) 팀원 의견 수렴 → (4) 글의 010 번호로 문자 → (5) 구장비 계좌이체 → (6) 당일 배정표 프로그램으로 GK/휴식 배정 → (7) 간식 구매·청구, 회비·벌금 정산을 모두 수작업으로 한다.

목표: 회장이든 팀원이든 누구나 접속해서 현재 상황(이번 주 투표, 매칭 후보, 확정 매치, 장부, 배정표)을 한눈에 보고, 반복 작업을 자동화한 **운영 허브**를 기존 레포(`coldclosewin-design/futsal-rotation`, GitHub Pages)에 확장해서 만든다. 구현은 Codex 클라우드에 PR 단위로 외주하고 Claude Code가 기획·리뷰·머지를 맡는다.

### 조사 결과 (2026-10-14)
- 기존 레포: 순수 HTML/JS, 빌드 없음, Pages는 `main`/root에서 배포 중, 이슈·PR 0건, 커밋 11건(절반이 Codex 작성). `rotation.js`(배정 엔진), `test.js`(Node 회귀 테스트 91건), `members.json`(12명), `index.html`, 구형 멤버 편집 페이지.
- 네이버 카페 **글 목록 API는 비로그인 공개**: `https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json?search.clubid=11367414&search.menuid={623|625|627|922}&search.perPage=30&search.page=1&search.queryType=lastArticle` → `articleId, subject, headName(지역 또는 "매치마감"), writeDateTimestamp, commentCount, readCount`. **글 본문(연락처)은 로그인 필수(401)**.
- 제목 포맷이 제각각: `10/17(토) 06-08시 …`, `10.18(토)/08:00~10:00/…`, `10월 18일 일요일 오전 10~12시 …`, `26.10.18 … 6vs6 …`, `17일 (토) … 16시~18시` → 정규식 파서 + "미분류" 폴백 필요.
- gh CLI는 `coldclosewin-design` 계정으로 로그인, 레포 admin 권한 있음.

### 사용자 결정 사항
| 항목 | 결정 |
|---|---|
| 카페 수집 | 목록만 자동 수집, 본문(연락처)은 회장이 수동 확인 후 입력 |
| 공유 데이터 저장 | Supabase 무료 티어 |
| 팀원 소통 | 웹 투표 페이지 + 카톡에는 링크만 |
| 접근 제어 | 읽기 = 팀 공용 PIN, 쓰기(장부·매칭상태) = 회장 비밀번호 |
| 레포/스택 | 기존 `futsal-rotation` 레포 확장, 순수 HTML/JS 유지 (빌드 없음) |
| 배정 로직 | Q1/Q8 가중치 없이, 사람별 out 쿼터 **간격 균등화** 최적화 |
| Codex 연동 | Codex 클라우드(GitHub 연동) → PR 자동 생성 → Claude 리뷰·머지 |
| MVP 범위 | 매칭 대시보드, 주간 투표+벌금, 장부, 배정표 리뉴얼, 문자 템플릿, 회칙/경기기록, 개인 페이지 (전부) |

## 1. 현재 프로세스 → 자동화/효율화 지점

| 단계 | 지금 (수동) | 허브에서 | 자동화 수준 |
|---|---|---|---|
| 일 13시 투표 등록 | 회장이 카톡 투표 생성 | 매주 일 13:00 Actions가 `polls` 행 자동 생성, 회장이 링크 1개를 카톡에 붙여넣기 | 자동 |
| 월 13시 마감 | 회장이 집계 | 마감 시각 지나면 자동 집계, 미투표자 자동 추출 → 벌금 5,000원 장부 자동 기입 | 자동 |
| 참석 인원 → 포맷 | 머릿속 계산 | 참석 N명 → 5v5/6v6 가능 여부·휴식 인원 자동 표시 | 자동 |
| 카페 4개 게시판 훑기 | 매일 눈으로 | 매시간 수집 → 토요일·오전·미마감·지역 필터, 8/7/9/10시 우선순위 정렬 | 자동(목록) |
| 글 본문 열어 연락처 확인 | 수동 | 후보 카드의 "카페에서 열기" 링크 → 회장이 010 번호·구장비 입력 | 반자동 |
| 팀원 의견 수렴 | 카톡 | 후보 카드 공유 링크(읽기 PIN) + 간단 👍 반응 | 반자동 |
| 상대팀 문자 | 직접 작성 | 후보 선택 → 문자 템플릿 자동 생성 → 폰에서 `sms:` 링크 탭 → 상태(연락/답장/확정) 추적 | 반자동 |
| 구장비 이체 | 수동 | 확정 매치에 금액 기록 → 장부에 자동 반영. 이체 자체는 수동 (금융 행위 자동화 제외) | 기록만 |
| 당일 배정표 | 별도 페이지에서 참가자 체크 | 이번 주 투표 "참석"자가 자동 체크된 상태로 배정표 생성, 결과를 `rotation_history`에 저장 | 자동 |
| 간식 구매·청구 | 카톡으로 청구 | 구매자가 금액 입력 → 회장 승인 → 장부 반영 | 반자동 |
| 회비·벌금·면제 | 회장 기억/메모 | 월 1일 회비 행 자동 생성, 회장 면제(매치 성사 주), 부상자 50%, 벌금 자동 합산, 개인별 미납 표시 | 자동 |
| 회칙 | 카톡 공지 | 회칙 페이지 + 벌금 규정이 장부 로직과 1:1 대응 | 정적 |

자동화 **하지 않는** 것: 계좌이체, 카톡 메시지 자동 전송(봇 API 없음), 카페 본문 스크래핑(로그인 필요·약관 리스크).

## 2. 아키텍처

```
GitHub Pages (정적 HTML/JS, 빌드 없음)
  ├─ index.html          허브 홈: 이번 주 투표 현황 · 확정 매치 · 매칭 후보 TOP · 공지
  ├─ vote.html           주간 투표 (이름 선택 → 참석/불참)   [읽기 PIN]
  ├─ matches.html        매칭 후보 대시보드 + 연락 상태 + 문자 템플릿   [읽기 PIN / 쓰기 회장]
  ├─ rotation.html       배정표 (기존 index.html 이관, 투표 참석자 자동 선택)
  ├─ ledger.html         회비·벌금·구장비·간식 장부   [읽기 PIN / 쓰기 회장]
  ├─ member.html?id=m03  팀원 개인 페이지 (납부·벌금·참석률·GK 횟수)
  ├─ rules.html          회칙 + 경기 기록
  ├─ admin.html          회장: 멤버 관리, 매치 확정, 벌금 승인, 간식 청구 승인
  ├─ js/
  │   ├─ supabase.js     클라이언트 초기화 + 로그인(팀 PIN / 회장) + 세션 헬퍼
  │   ├─ rotation.js     배정 엔진 (기존, 간격 균등화 추가)
  │   ├─ parse-title.js  카페 제목 파서 (브라우저·Node 공용, 순수 함수)
  │   ├─ rules.js        벌금/회비/면제 계산 순수 함수 (회칙 1:1)
  │   └─ ui.js           토스트, 테이블 렌더 등 공용
  ├─ scripts/
  │   └─ scrape-cafe.js  Node 20, 4개 게시판 수집 → 파싱 → Supabase upsert
  ├─ scripts/
  │   └─ housekeeping.js 멱등 작업: 다음 poll 생성 · 마감 후 미투표 벌금 · 매월 1일 회비/부상면제 행
  ├─ .github/workflows/
  │   ├─ test.yml        PR마다 node --test
  │   └─ cron.yml        매시간(KST 06~24시) scrape → housekeeping 순차 실행, workflow_dispatch
  ├─ test/               node --test: rotation, parse-title, rules
  ├─ AGENTS.md           Codex용 작업 규약
  └─ docs/tasks/NNN-*.md Claude가 쓰는 Codex 발주서
Supabase (무료)  ←  anon key + 공유 계정 2개(team / admin), 스크래퍼·크론은 service-role key(GitHub Secret)
```

- **인증 모델**: Supabase Auth 이메일/비번 계정 2개만 생성. `team@fcexican.local`(비번 = 팀 PIN), `admin@fcexican.local`(비번 = 회장 비밀번호). RLS: 비로그인은 어떤 테이블도 SELECT 불가 → 연락처·계좌 노출 차단. `team` 세션은 SELECT 전부 + `votes`·`reactions`·`snack_claims` INSERT만. `admin` 세션은 전부. 세부 정책은 §4.
- **설정 노출**: `js/config.js`에 Supabase URL·anon key 하드코딩(anon key는 RLS 전제로 공개 가능). service-role key는 절대 레포에 넣지 않음.
- **시간대**: 모든 cron은 UTC로 쓰되 주석에 KST 명시 (일 13:00 KST = 일 04:00 UTC, 월 13:00 KST = 월 04:00 UTC).

## 3. 카페 수집기 (scripts/scrape-cafe.js)

- 입력: 메뉴 4개 `{623: "성남/하남", 625: "서울북동", 627: "서울남동", 922: "남양주/구리"}`, 각 1~2페이지(perPage 30).
- 필터 1차(수집 단계에서는 버리지 않고 플래그만): `headName === "매치마감"` 또는 제목에 `마감|완료|구함완료|모집완료` → `closed=true`.
- `parse-title.js`가 제목에서 추출: `game_date`(연도는 글 작성일 기준 보정), `weekday`, `start_hour`, `end_hour`, `format`(`5v5|6v6|기타|null`), `venue_hint`(날짜·시간 토큰 제거 후 남은 문자열). 파싱 실패 필드는 null → 대시보드에서 "미분류"로 표시되어 수동 확인 가능.
- 점수 `our_score`: 토요일 +100, `start_hour` 8:+40 / 7:+30 / 9:+20 / 10:+10 / 그 외 오전 +0 / 오후·평일 -100, 포맷 5v5·6v6 +10, 글 작성 24h 이내 +5. 대시보드는 `closed=false AND game_date>=today` 중 점수순.
- Supabase upsert `match_candidates` on `article_id`: 스크래퍼가 소유하는 컬럼(subject, head_name, write_ts, comment_count, read_count, closed, parsed_*)만 갱신, 회장 입력 컬럼(phone, contact_status, memo, cost 등)은 건드리지 않음 (`upsert` 시 컬럼 목록 제한).
- 실패 처리: 메뉴 1개 실패해도 나머지 계속, 종료 코드 0, 요약 로그. 3회 연속 전체 실패 시 Actions가 이슈 자동 생성(선택).
- **리스크**: GitHub 호스티드 러너(미국)에서 `apis.naver.com` 차단 가능성. 첫 PR 머지 후 `workflow_dispatch`로 즉시 검증. 차단 시 폴백 = Supabase Edge Function cron(도쿄/서울 리전) 또는 회장 PC 작업 스케줄러.

## 4. 데이터 모델 및 RLS (`supabase/schema.sql`)

### 인증 메커니즘
- Supabase Auth 계정 2개: `team@fcexican.local`(비번 = 팀 PIN, **6자 이상**), `admin@fcexican.local`(회장 비번). 대시보드에서 confirmed 상태로 직접 생성.
- **필수 설정: Auth → "Allow new user signups" OFF**. 켜져 있으면 anon key로 누구나 가입해 `authenticated`가 되어 연락처를 읽을 수 있음.
- SQL 함수 `is_team()` = `auth.jwt()->>'email' in ('team@…','admin@…')`, `is_admin()` = `… = 'admin@…'` (`language sql stable security definer`). `anon`용 정책은 아예 없음 → 기본 거부.
- 클라이언트는 세션 1개만 유지. "회장 모드" = team 로그아웃 후 admin 로그인. admin도 `is_team()`을 만족하므로 읽기 정책은 하나로 충분.
- 검토 후 기각한 대안: anon key + RPC에서 PIN 검사 → 세션이 없으면 `select`를 PIN에 종속시킬 방법이 없어 읽기가 열림. 2계정 방식이 최소 구성.

### 테이블 (모두 RLS on, `created_at timestamptz default now()`)

| 테이블 | 컬럼 | 키 | select | insert/update |
|---|---|---|---|---|
| `members` | `id text`(m01), `name`, `phone`, `bank_account`, `active bool`, `joined_at date`, `is_president bool`, `injury_from date`, `injury_to date` | PK id, unique name | team | admin |
| `polls` | `id uuid`, `match_date date`(대상 토요일), `opens_at`, `closes_at`, `cancelled bool`, `match_id uuid null` | PK id, unique match_date | team | admin / cron(service role) |
| `poll_votes` | `poll_id`, `member_id`, `choice check in (attend, absent)`, `voted_at`, `is_late bool`, `updated_at` | PK (poll_id, member_id) | team | **team** insert/update, check `poll not cancelled`; 트리거가 `is_late = now() > closes_at`, `updated_at` 설정 |
| `match_candidates` | 스크래퍼 소유: `article_id bigint`, `menu_id`, `menu_name`, `subject`, `head_name`, `is_closed`, `write_ts`, `comment_count`, `read_count`, `parsed_date`, `start_hour`, `end_hour`, `weekday`, `parsed_format`, `venue`, `parse_ok`, `scraper_score`, `first_seen_at`, `last_seen_at` / 회장 소유: `phone`, `contact_status default 'new' check in (new, contacted, replied, confirmed, rejected)`, `memo`, `our_priority`, `admin_updated_at` | PK article_id | team | admin update만 (클라이언트 insert 없음, 스크래퍼는 service role) |
| `candidate_reactions` | `article_id`, `member_id`, `created_at` | PK (article_id, member_id) | team | team insert/delete |
| `matches` | `id uuid`, `match_date`, `start_time`, `end_time`, `venue`, `opponent`, `format check (5v5,6v6)`, `cost int`, `candidate_article_id null`, `poll_id null`, `arranged_by text null → members`(회장 면제 근거), `status check (scheduled, played, cancelled, fallback_plab)`, `score_us`, `score_them`, `schedule jsonb`(배정표 원본), `memo` | PK id, unique (match_date, start_time) | team | admin |
| `match_attendance` | `match_id`, `member_id`, `status check (present, late, late_kickoff, no_show, excused)`, `note` | PK (match_id, member_id) | team | admin |
| `ledger` | `id bigint identity`, `entry_date`, `member_id null`(null = 팀 단위), `category check in (dues, injury_exempt, president_exempt, fine_late_vote, fine_no_show, fine_late, fine_late_kickoff, venue_fee, snack, plab_support, deposit, adjustment)`, `amount int`(부호: + 팀에 들어옴/팀에 내야 함, − 팀에서 나감/팀이 줘야 함), `settled bool`, `ref_match_id`, `ref_poll_id`, `note` | PK id; unique (member_id, category, ref_poll_id), (member_id, category, ref_match_id), (member_id, category, entry_date) → 중복 기입 방지(멱등) | team | admin |
| `snack_claims` | `id`, `match_id`, `buyer_id`, `amount`, `items text`, `status check (pending, approved, rejected)` | PK id | team | team insert(buyer 본인), admin update → 승인 시 `ledger(snack, −amount, settled=false)` 생성 |
| `rotation_history` | `match_id`, `member_id`, `active_quarters`, `gk_count`, `rest_count`, `out_quarters int[]` | PK (match_id, member_id) | team | admin |

주의: 기존 `index.html`은 `quartersMap`과 players를 **이름**으로 키잉하므로, `rotation_history` 저장 시 이름→`member_id` 매핑 필요.

### 규칙 처리 위치
- 벌금 금액 상수는 `js/config.js` (미투표 5,000 / 급불참 10,000 / 지각 10,000 / 경기 후 도착 30,000). DB에는 결과 행만.
- 투표 상태는 `now()` vs `closes_at`로 읽기 시점에 판정(마감 크론 불필요). 매시간 cron이 (1) 다음 토요일 poll 행을 일 13:00 KST 이후 멱등 생성, (2) `closes_at` 지난 poll의 미투표 active 멤버에게 `fine_late_vote` 멱등 insert, (3) 매월 1일 `dues +30,000`(active 멤버) 및 부상 기간 겹치면 `injury_exempt −15,000` insert.
- 회장 면제: 매치를 `played`로 바꾸고 `arranged_by`가 회장이면 `president_exempt` insert. 금액은 설정값(`'week'` 모드 −7,500 = 30,000/4 또는 `'month'` 모드 −30,000 월 1회) — §10-5 회장 확인 후 확정.
- 잔액 = `sum(amount) where settled or member_id is null`; 개인 미납 = `sum(amount) where member_id = X and not settled`.

### 각 측이 필요한 것
- **GitHub Actions**: Secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Node 20 내장 fetch. `upsert(rows, { onConflict: 'article_id' })` 본문에 **스크래퍼 소유 컬럼만** 포함 → PostgREST는 본문에 있는 컬럼만 갱신하므로 회장 입력 컬럼 보존.
- **정적 페이지**: `js/config.js`에 URL + anon key, supabase-js v2 CDN, `signInWithPassword`. 읽기는 select, 투표·반응·간식청구는 team 세션 upsert, 나머지 쓰기는 admin 세션(RLS가 강제, UI는 버튼만 숨김).

## 5. 배정 엔진 변경 (rotation.js) — out 쿼터 간격 균등화

### (a) 간격 페널티 항 (scheduleScore에 추가, 테스트용 export)
- 선수 p, 활동 범위 `[s, e]`, `L = e − s + 1`, out(GK 또는 휴식) 쿼터 정렬 `q1 < … < qk`. `k = 0` → 0.
- 플레이 구간 길이(k+1개): `q1 − s`, `q(i+1) − q(i) − 1`, `e − qk`. 합은 항상 `L − k`.
- `ideal = (L − k)/(k + 1)`; `ideal = 0` → 0.
- `pen(p) = mean((run − ideal)²) / ideal²` (k·범위가 달라도 비교 가능, 대략 0~2).
- `spacingPenalty(schedule) = mean(pen(p))` (k ≥ 1인 선수).
- 기준값(8쿼터 풀타임): Q3&Q6 → 0, Q2&Q6 → 0.17, Q2&Q4 → 0.5, Q1&Q6 → 0.67, Q1&Q8 → 2.0, k=1 Q1 → 1.0, k=1 Q4 → 0.02.
- 새 점수: `excess×10000 + outSpread×1000 + gkSpread×100 + restSpread×100 + spacingPenalty×200 (+ strict 불가 시 raw violations)`. 우선순위 유지: 연속 금지 > out 횟수 공평 > 역할 공평 ≈ 간격. 7명 중 1명 몰림 ≈ 14점 ≈ GK 1회 차이 수준 → 횟수 동률 사이에서 간격을 가르되 횟수를 희생하진 않음.
- `validateSchedule`: `pen(p) > 1.0`이면 경고 `out 간격 편중: A (Q2,Q4)`.

### (b) 그리디 타이브레이크 (필요)
- 재시도만으로는 간격 좋은 해가 아예 안 나오는 경우가 있음(횟수 동률 시 몰림).
- `lastOut[player]`(초기 `range.start − 1`) 유지. `outSort`에서 전략별 횟수 키 다음, `salts` 전에 `since = quarter − lastOut[p]` 내림차순(가장 오래 뛴 사람 우선).
- 전략 3 추가(`seed % 4`): `since`가 1차 키. 기존 어서션은 모두 임계값 기반이라 안전.

### (c) test.js 추가 케이스
- `spacingPenalty`, `playerSpacing(schedule, player, range)` export; 테스트에 `outQuarters(schedule, player)` 헬퍼.
- `[spacing-unit]` 수제 스케줄 정확값: Q3&Q6 → 0, Q2&Q4 → 0.5, Q1&Q8 → 2.0, k=1 Q1 → 1.0, 부분참가 A{3..8} out Q3&Q6 → 0.5, k=0 → 0, 전 쿼터 out → 0(NaN 금지).
- `[spacing] N명/포맷` strict 가능한 기본 케이스(6,7,8/5v5; 7~11/6v6; 9~11/5v5): `spacingPenalty ≤ 0.4`, k≥2 선수 내부 간격 ≤ 5(Q1&Q7, Q1&Q8 금지), k≥2 선수의 out이 전부 ≤Q4 또는 전부 ≥Q5가 아님, 개인 `pen ≤ 0.7`.
- `[spacing] 12/5v5, 12/6v6`(strict 불가): `spacingPenalty ≤ 0.8`만.
- `[spacing-dynamic]` 기존 dynamic 5케이스 재사용: 풀타이머 `pen ≤ 0.7`, 부분참가자 pen 유한·≥0, `outQuarters(A)`가 범위 내.
- `[determinism]` 같은 입력 2회 → `JSON.stringify` 동일.
- 보정 규칙: 1회 실행 후 관측 최대값의 1.5배로 임계값 조정. 기존 `GK/Rest spread ≤ 2`가 깨지면 테스트를 늦추지 말고 가중치 200 → 100으로 낮춤.

### (d) 부분 참가자
- 구간은 `range.start`~`range.end` 기준(Q1/Q8 아님) → Q3 합류자가 Q1~Q2에 "out 아님"으로 불이익 없음.
- `lastOut` 초기값 `start − 1` → 합류 첫 쿼터는 since=1로 우선 플레이(현 동작과 동일).
- 엣지: `k=0`, `ideal=0`, `L=1` → 0. out 집합은 `prevOut`과 동일(GK+휴식)로 연속 금지 규칙과 일관.

## 6. 회칙 → 규칙 엔진 (js/rules.js, 순수 함수 + 테스트)

| 회칙 | 함수/규칙 |
|---|---|
| 회비 3만원, 매월 1일 | `monthlyDues(member, month)` → 기본 30,000 |
| 운영위원장 면제 (매치 성사 주) | 해당 월에 `matches.arranged_by = president`가 1건 이상이면 0원 (회칙 문구가 "공식 경기가 있는 주"라 월 단위 해석은 회장 확인 필요 → 설정값 `PRESIDENT_EXEMPT_MODE: 'month'|'week'`) |
| 부상자 50% | `members.injury_from/injury_to`가 월과 겹치고 기간 ≥ 4주면 15,000 |
| 미투표 5,000 | 마감 시 `votes`에 없는 active 멤버 → `ledger`에 `fine_no_vote` |
| 참석 후 불참 10,000 | 회장이 admin에서 "급불참" 체크 → `fine_no_show`; 애사 사유 면제 플래그 |
| 지각 10,000 / 경기 후 도착 30,000 | admin에서 도착 시각 입력 → 자동 분기 |
| 매칭 불가 주 플랩비 지원(월 1회) | `matches.status='fallback_plab'` + 참석자별 `plab_support` 행, 월 1회 제한 검사 |
| 간식 (물2+음료1 겨울 / 물2+음료2 여름) | `snack_claims`(buyer, amount, receipt_note) → admin 승인 시 `ledger` expense + 환급 |

## 7. 화면별 핵심 동작

- **vote.html**: 이번 주 poll 1건 표시. 이름 드롭다운 → 참석/불참 버튼 → `votes` upsert(poll_id, member_id). 마감 후에는 읽기 전용 + 결과 요약(참석 N명 → "5v5 가능, 휴식 N명"). 미투표자 목록 표시.
- **matches.html**: 좌측 후보 카드 목록(점수순, 필터: 지역·날짜·포맷·미분류 포함). 카드: 제목, 지역, 날짜/시간, 작성일, 댓글수, "카페에서 열기"(`https://cafe.naver.com/f-e/cafes/11367414/articles/{articleId}?menuid={menuId}`), 👍 반응 수. 회장 모드: 전화번호·구장비·메모 입력, 상태 버튼(연락→답장→확정/거절), **문자 템플릿** 생성 → `sms:010...?body=...` 링크(모바일) + 복사 버튼. 확정 시 `matches` 행 생성 모달(날짜·시간·구장·상대팀·비용·포맷 자동 채움).
- **rotation.html**: 기존 index.html 로직 이관. 상단에 "이번 주 참석자 불러오기" 버튼(투표 참석자 자동 체크). 생성 후 "이번 매치에 저장" → `rotation_history`. 멤버 목록은 `members` 테이블(폴백 members.json).
- **ledger.html**: 월 선택 → 멤버×항목 표(회비/벌금/환급/납부), 잔액, 미납자. 회장 모드: 납부 체크, 벌금 수동 추가/면제, 간식 청구 승인.
- **member.html**: 개인 납부 현황, 벌금 이력, 최근 12주 참석률, GK/휴식 누적.
- **rules.html**: 회칙 전문(마크다운 → HTML) + 경기 기록 표(`matches`).
- **admin.html**: 멤버 CRUD(members 테이블; members.json은 폴백/시드로만 유지), 부상 기간 설정, 투표 수동 생성/마감, 매치 상태 변경.
- 모든 페이지 공통: 첫 진입 시 PIN 입력 모달 → `team` 로그인, 세션은 localStorage 유지. 우상단 "회장 로그인" → `admin` 세션으로 교체. 모바일 우선(카톡 인앱 브라우저에서 열림).

## 8. Codex 외주 워크플로우

```
Claude Code (컨트롤 타워)                    Codex 클라우드 (구현)
─────────────────────────                    ──────────────────────
1. docs/tasks/NNN-slug.md 작성·커밋(main)  →  2. 사용자가 chatgpt.com/codex에서
   (목표, 범위, 파일, 수용 기준, 테스트)         "docs/tasks/NNN-slug.md 수행" 발주
                                             3. 브랜치 codex/NNN-slug, PR 생성
4. gh pr checkout/diff, node --test 실행   ←     (PR 본문에 체크리스트 자동)
   리뷰 코멘트 or 승인
5. squash merge → Pages 자동 배포
6. 브라우저로 실배포 검증 → 다음 NNN 작성
```

- **AGENTS.md** (Codex가 읽는 레포 규약): 순수 HTML/JS·빌드 금지, 한국어 UI, `node --test` 통과 필수, 발주서의 "범위 밖" 변경 금지, PR 제목 `[NNN] 제목`, PR 본문에 발주서 수용 기준 체크리스트 복사, service-role key·개인정보 커밋 금지, `.github/workflows`는 발주서에 명시된 경우만 수정.
- **발주서 템플릿** `docs/tasks/_template.md`: 배경 / 목표 / 변경 파일 / 변경 금지 파일 / 수용 기준(체크박스) / 테스트 방법 / 참고(기존 함수명). 한 발주서 = 한 PR = 반나절 분량.
- **리뷰 기준** (Claude): 수용 기준 전부 충족, 테스트 추가 여부, RLS 우회·키 노출 없음, 모바일 레이아웃, 기존 테스트 회귀 없음. 미충족 시 PR 코멘트로 재요청(새 발주서 아닌 동일 PR 수정).
- 브랜치 보호: `main`에 PR 필수·테스트 Actions(`node --test`) 필수 체크 설정(1회, 회장 승인 후).

## 9. 작업 순서 (발주서 단위, 각 1 PR)

| # | 발주서 | 내용 | 의존 |
|---|---|---|---|
| 000 | 사전 준비 (사용자 직접) | Supabase 프로젝트 생성, Auth 계정 2개, GitHub Secrets(`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`), Codex에 레포 연결 | — |
| 001 | 레포 골격 | AGENTS.md, docs/tasks 템플릿, `node --test` 전환(기존 test.js 유지), `.github/workflows/test.yml`, 기존 index.html → rotation.html 이관 + 새 허브 index.html 뼈대, js/config.js | 000 |
| 002 | Supabase 스키마 | `supabase/schema.sql`(테이블·RLS·시드 members), `supabase/README.md` 적용 절차. Claude가 SQL 편집기에서 실행 | 000 |
| 003 | 인증·공용 모듈 | js/supabase.js (PIN 모달, team/admin 로그인, 세션), js/ui.js | 002 |
| 004 | 제목 파서 | js/parse-title.js + 실제 제목 40개 픽스처 테스트 | 001 |
| 005 | 카페 수집기 + cron | scripts/scrape-cafe.js, cron.yml(scrape 스텝), upsert 컬럼 제한 | 002, 004 |
| 006 | 매칭 대시보드 | matches.html: 후보 목록·필터·점수·👍반응·연락상태·문자 템플릿·매치 확정 | 003, 005 |
| 007 | 주간 투표 + housekeeping | vote.html + scripts/housekeeping.js(poll 생성·미투표 벌금, cron.yml 스텝 추가) + rules.js 1차 | 003, 005 |
| 008 | 배정 엔진 간격 균등화 | rotation.js §5 (a)(b) + test.js §5 (c), rotation.html 투표 연동·history 저장 | 001, 007 |
| 009 | 장부 | ledger.html, rules.js 완성(회비·면제·벌금·간식청구 승인), housekeeping에 월초 회비 스텝 | 007 |
| 010 | 개인 페이지·회칙·경기기록·admin | member.html, rules.html, admin.html | 006, 009 |
| 011 | 허브 홈 통합 + 모바일 마감 | index.html 위젯, 카톡 공유 링크, README/CHANGELOG v2.0.0 | 전체 |

## 9-1. 승인 직후 Claude가 직접 수행하는 일 (Codex 발주 전)
1. `C:\Project\15_SmallProject\04_풋살매칭프로그램\futsal-rotation\`에 레포 clone (프로젝트 폴더 안, 외부 경로 변경 없음).
2. 직접 작성·커밋·push(main): `AGENTS.md`, `docs/tasks/_template.md`, `docs/tasks/001-scaffold.md`, `docs/tasks/002-supabase-schema.md`, `docs/PLAN.md`(이 계획 요약). 발주서는 Codex가 읽는 입력이므로 Claude가 쓴다.
3. 사용자에게 §10 사전 준비 안내 + 001 발주 프롬프트 한 줄 전달 → 사용자가 Codex에 발주.
4. PR 도착 시: `gh pr checkout` → `node --test` → 리뷰 → squash merge → 배포 URL 확인 → 다음 발주서.

## 10. 사전 준비 (사용자 직접, Claude 불가)
1. https://supabase.com 프로젝트 생성 (리전: Northeast Asia). Settings → API에서 URL, anon key, service_role key 확보.
2. Authentication → Providers → Email: **"Allow new user signups" OFF**, 이메일 확인 OFF. Users에서 `team@fcexican.local`(비번 = 팀 PIN, 6자 이상), `admin@fcexican.local`(회장 비번) 수동 생성.
3. GitHub 레포 Settings → Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
4. chatgpt.com/codex에서 GitHub 연결 후 `futsal-rotation` 레포 권한 부여.
5. 회장 확인 필요한 해석: "회비 면제 = 매치 성사한 주" 를 월 단위로 볼지(§6).

## 11. 검증
- 단위: `node --test` (rotation 기존 91 + 간격 테스트, parse-title 픽스처 40건, rules 벌금/면제 케이스).
- 수집기: PR 머시 후 `gh workflow run scrape.yml` → Supabase 테이블에 행 생성 확인, 미국 러너 차단 여부 확인.
- 크론: `cron.yml`을 `workflow_dispatch`로 수동 실행해 poll 생성·미투표 벌금·회비 행 생성이 멱등(2회 실행해도 행 중복 없음)인지 확인, 실제 일/월 cron 1주 관찰.
- E2E(내장 브라우저, 배포 URL): PIN 없이 데이터 비노출 → PIN 입력 후 투표 → 회장 로그인 후 후보 상태 변경·문자 템플릿 → 매치 확정 → 배정표 참석자 자동 로드 → 장부 반영. 모바일 뷰포트(375px)에서 동일 확인.
- 보안: anon key만으로 REST 호출 시 모든 테이블 0행 반환 확인(`curl -H apikey:`).

## 12. 리스크·열린 질문
- 네이버 API가 러너 IP를 차단하거나 응답 포맷 변경 → §3 폴백.
- 카톡 인앱 브라우저에서 `navigator.clipboard`·`sms:` 동작 차이 → 복사 폴백(prompt) 유지, 외부 브라우저 열기 안내.
- Supabase 무료 프로젝트는 7일 미사용 시 일시정지 → 매시간 cron이 사실상 keep-alive 역할.
- 공유 계정 1개로 투표하므로 "남의 이름으로 투표" 가능 → 투표 변경 이력(`votes.updated_at`, 기기 식별자) 기록으로 사후 확인만.
