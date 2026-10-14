# [007] 주간 참석 투표 페이지 + housekeeping(투표 생성·미투표 벌금·월회비) + 공용 데이터 모듈

- 브랜치: `codex/007-weekly-poll`
- 의존: 003, 005 (main에 머지됨)
- 예상 규모: L

## 배경
매주 일요일 13:00(KST)에 다음 토요일 경기 투표가 열리고 월요일 13:00에 마감됩니다. 기한 내 미투표는 벌금 5,000원입니다
(회칙 4조). 지금은 카톡 투표를 회장이 수작업 집계합니다. 투표 페이지를 만들고, 매시간 cron이 투표 생성·마감 후 벌금·
월초 회비 행을 멱등하게 만들도록 합니다 (`docs/PLAN.md` §4 "규칙 처리 위치", §6, §7).
또한 이후 페이지(006 매칭 대시보드, 009 장부)가 함께 쓸 **공용 모듈 2개**를 이 발주서에서 만듭니다:
"내 이름 선택"(`js/member.js`)과 Supabase 읽기/쓰기 헬퍼 + 데모 모드(`js/data.js`).

**Supabase 프로젝트는 아직 없을 수 있습니다.** 모든 화면은 설정이 비어 있거나 `?demo=1`이면 픽스처로 동작해야 하고
(데모 배너 표시), Codex는 데모 모드로 화면을 검증합니다. 실제 DB 경로는 Claude가 검증합니다.

## 목표
- `vote.html`에서 팀원이 이름을 고르고 참석/불참을 누르면 저장되고, 현황(참석자·불참자·미투표자·가능 포맷)이 보인다.
- `scripts/housekeeping.js`가 (1) 다음 토요일 투표 생성 (2) 마감 지난 투표의 미투표 벌금 (3) 이번 달 회비 행을 멱등 생성한다.
- `js/member.js`, `js/data.js`, `js/rules.js`가 다른 페이지에서 재사용 가능하다.

## 변경 파일
- (신규) `vote.html`
- (신규) `js/member.js` — 내 이름 선택 (localStorage `exican_member_id`)
- (신규) `js/data.js` — 전역 `ExicanData`: Supabase 쿼리 헬퍼 + 데모 모드
- (신규) `js/rules.js` — 순수 함수: 날짜·투표 창·벌금·회비·참석 요약
- (신규) `scripts/housekeeping.js`, (신규) `scripts/lib/rest.js` — PostgREST 호출 헬퍼(service role)
- `.github/workflows/cron.yml` — housekeeping 스텝 추가
- (신규) `test/rules.test.js`, (신규) `test/housekeeping.test.js`
- (신규) `test/fixtures/demo-data.json` — 데모용 members/polls/poll_votes (아래 §7)
- `index.html` — "이번 주 투표" 카드에 요약 표시 (데이터 모듈 사용)
- `styles.css` — 투표 버튼·현황 목록 스타일
- `README.md` — 투표·housekeeping 절

## 변경 금지
- `scripts/scrape-cafe.js`, `js/supabase.js`, `js/parse-title.js`, `js/rotation.js`, `supabase/*`, `test/fixtures/cafe-titles.json`, `test/fixtures/api-menu-623.json`

## 상세 요구사항

### 1. `js/rules.js` (순수 함수, Node export + `window.ExicanRules`)
- `kstDate(isoOrDate)` → `"YYYY-MM-DD"` (KST). `nextSaturday(kstDateStr)` → 오늘이 토요일이면 오늘, 아니면 다가오는 토요일.
- `pollWindow(matchDate)` → `{ opens_at, closes_at }` ISO(+09:00): opens = matchDate − 6일 13:00 KST(일요일), closes = matchDate − 5일 13:00 KST(월요일).
- `pollStatus(poll, nowIso)` → `"scheduled" | "open" | "closed" | "cancelled"`.
- `attendanceSummary(votes, members)` → `{ attend: [members], absent: [members], pending: [members], count, formats: { "5v5": { ok, rest }, "6v6": { ok, rest } } }` — `ok = count >= 5|6`, `rest = count − 5|6` (음수면 null). `members`는 `active`만.
- `lateVoteRows(poll, votes, members, fine, entryDate)` → 미투표(투표 없음) **또는** `is_late === true`인 active 멤버마다 `{ member_id, category: "fine_late_vote", amount: fine, ref_poll_id: poll.id, entry_date, note: "투표 마감(월 13:00) 미참여" }`. 회장도 예외 없음. `poll.cancelled`면 빈 배열.
- `monthlyDuesRows(members, monthStr /* "2026-10" */, config)` → active 멤버마다 `{ member_id, category: "dues", amount: DUES_MONTHLY, entry_date: "<month>-01", note: "10월 회비" }`; 부상 기간(`injury_from`~`injury_to`)이 그 달과 겹치고 길이가 28일 이상이면 추가로 `{ category: "injury_exempt", amount: -DUES_MONTHLY * INJURY_EXEMPT_RATE, entry_date 동일, note: "부상 면제 50%" }`.
- `formatRelative(isoOrDate, nowIso)` → "3시간 전", "2일 전", "방금" 등 한국어 (006에서도 사용).

### 2. `js/member.js` → 전역 `ExicanMember`
- `getId()` → localStorage `exican_member_id` 또는 null. `set(id)`, `clear()`.
- `ensure(members)` → 저장된 id가 `members`에 있으면 그 멤버 반환, 없으면 선택 모달(이름 버튼 그리드, 12명이 한 화면) 띄우고 선택 시 저장 후 반환. 모달은 `js/supabase.js`의 `.modal` 스타일 재사용(클래스만).
- `renderBadge(container, member, onChange)` → "내 이름: 안준호 [변경]" 작은 줄.

### 3. `js/data.js` → 전역 `ExicanData`
- `mode()` → `"demo" | "live"`. demo = `!isConfigured(EXICAN_CONFIG)` 또는 `location.search`에 `demo=1`.
- demo이면 `fetch("test/fixtures/demo-data.json")`을 메모리에 올리고 쓰기는 메모리에만 반영(새로고침 시 초기화). 페이지 상단에 `.auth-banner`와 같은 톤의 배너 "데모 데이터입니다 (저장되지 않음)".
- live이면 `await ExicanAuth.init()` 클라이언트로 supabase-js 쿼리. 에러는 `showToast`.
- API (모두 Promise):
  - `members({ activeOnly = true })` → `[{id,name,active,is_president,...}]` id 순
  - `currentPoll(nowIso)` → `match_date >= 오늘(KST)` 중 가장 이른 poll 또는 null
  - `votes(pollId)` → `[{poll_id, member_id, choice, is_late, updated_at}]`
  - `castVote(pollId, memberId, choice)` → upsert(`poll_votes`, onConflict `poll_id,member_id`)
  - `candidates(opts)`, `reactions(articleIds)`, `toggleReaction(articleId, memberId)`, `updateCandidate(articleId, patch)`, `createMatch(row)`, `matches({ from })`, `ledger({ month })` — **이 발주서에서는 시그니처와 demo 구현만** 만들고 live 구현은 간단한 `select`/`upsert`로 작성 (006·009에서 사용·보강).

### 4. `vote.html`
- 로드 순서: config → supabase CDN → ui → supabase.js → rules.js → member.js → data.js → 페이지 스크립트. `renderNav("vote")`, `ExicanAuth.renderAuthBar()`, live면 `await ExicanAuth.requireTeam()`.
- 상단: 투표 제목 "10/17(토) 경기 참석 투표", 상태 배지(진행 중 / 마감됨 / 예정), 마감 시각 "월 13:00 마감 · 남은 시간 1일 3시간". 투표가 없으면 "아직 열린 투표가 없습니다. 일요일 13:00에 자동 생성됩니다."
- 내 이름 뱃지(`ExicanMember`) + 큰 버튼 2개 "참석" / "불참" (현재 선택 강조). 누르면 즉시 저장 + 토스트. 마감 후에도 투표 가능하되 버튼 아래 "마감 후 투표는 벌금 대상입니다" 문구, 저장 결과의 `is_late`가 true면 목록에 "지각" 배지.
- 현황: "참석 7명 → 5v5 가능 (휴식 2명) · 6v6 가능 (휴식 1명)" 한 줄 요약 + 세 목록(참석/불참/미투표, 이름 칩). 투표 시각은 `formatRelative`.
- 회장(admin) 전용: "투표 취소" 토글(`polls.cancelled`), "다음 투표 지금 생성" 버튼(`pollWindow(nextSaturday)`로 insert, 중복이면 토스트).
- 375px에서 버튼 2개가 한 줄, 이름 칩은 줄바꿈.

### 5. `scripts/housekeeping.js` (Node 20, CommonJS, 의존성 없음)
- `scripts/lib/rest.js`: `select(table, query)`, `insertIgnore(table, rows)`(`Prefer: resolution=ignore-duplicates,return=minimal` + `on_conflict` 파라미터 인자), `update(table, match, patch)`. 헤더 apikey/Bearer = service key. 2xx 아니면 상태코드+본문 300자 throw. `fetchImpl` 주입 가능.
- 흐름 `main(argv, deps)` (`--dry-run`이면 쓰기 대신 계획 출력):
  1. `members` (active) 조회.
  2. **투표 생성**: `d = nextSaturday(오늘)`; `pollWindow(d)`; `now >= opens_at`이고 해당 `match_date` poll이 없으면 insert. 같은 주 토요일이 이미 지났으면(토요일 당일 포함 안 함) 다음 주.
  3. **미투표 벌금**: `closes_at < now and cancelled = false`이고 `closes_at`이 최근 14일 이내인 poll들에 대해 `lateVoteRows` → `insertIgnore("ledger", rows, "member_id,category,ref_poll_id")`.
  4. **월회비**: 이번 달(KST) `monthlyDuesRows` → `insertIgnore("ledger", rows, "member_id,category,entry_date")`.
  5. 요약 로그: `poll: created 2026-10-17` 또는 `poll: exists`, `late_vote: 3 rows (inserted ≤3)`, `dues: 12 rows`. 종료코드: 예외 시 1, 시크릿 없고 dry-run 아니면 2.
- `insertIgnore`는 PostgREST의 `on_conflict` + `resolution=ignore-duplicates`를 쓰므로 반복 실행해도 중복이 생기지 않는다. partial unique index라서 `on_conflict` 컬럼 지정이 필요하다.

### 6. `cron.yml`
- scrape 스텝 뒤에 `- run: node scripts/housekeeping.js ${{ inputs.dry_run && '--dry-run' || '' }}` 스텝 추가, `if: ${{ !cancelled() }}`, 같은 env. 스케줄·권한·concurrency는 그대로.

### 7. `test/fixtures/demo-data.json`
```json
{ "members": [12명, members.json과 동일 id/name, m03 is_president true, 모두 active true, m07 injury_from "2026-10-01" injury_to "2026-11-15"],
  "polls": [{ "id": "demo-poll-1", "match_date": "<다가오는 토요일을 페이지 로드 시 계산해 치환>", ... }],
  "poll_votes": [m01 attend, m02 attend, m03 attend, m04 absent, m05 attend(is_late true), m06 attend, m08 attend] }
```
- 날짜는 고정값으로 두되(`2026-10-17`), `js/data.js` demo 로더가 `polls[*].match_date`를 `nextSaturday(오늘)`로, `opens_at/closes_at`를 `pollWindow`로 치환해 항상 "이번 주" 투표처럼 보이게 한다.

### 8. 테스트
- `test/rules.test.js`: `nextSaturday`(수요일→토, 토→당일, 일→다음 토), `pollWindow("2026-10-17")` → opens `2026-10-11T13:00:00+09:00`, closes `2026-10-12T13:00:00+09:00`; `pollStatus` 4상태; `attendanceSummary` 7명 참석 → 5v5 ok rest 2, 6v6 ok rest 1; 4명 → 둘 다 불가; `lateVoteRows`(미투표 2명 + 지각 1명 → 3행, cancelled → 0행); `monthlyDuesRows`(12명 → 12행 + 부상 1명 면제 −15000, 27일짜리 부상은 면제 없음); `formatRelative`.
- `test/housekeeping.test.js`: `fetchImpl` 모킹으로 (a) 일요일 12:59에는 poll 미생성, 13:00에는 생성, (b) 이미 있으면 insert 호출 없음, (c) 마감 지난 poll의 벌금 insert 본문이 `lateVoteRows`와 같고 URL에 `on_conflict=member_id,category,ref_poll_id`, (d) dues insert `on_conflict=member_id,category,entry_date`, (e) dry-run은 POST 없음.
- `js/data.js`·`js/member.js`는 DOM 의존이라 Node 테스트 제외. 대신 `vote.html?demo=1`을 Codex가 브라우저로 확인.

## 수용 기준
- [ ] `npm test` 통과 (기존 302 + 신규)
- [ ] `vote.html?demo=1`: 데모 배너, 이름 선택 모달 → 참석 클릭 → 현황이 즉시 갱신(참석 수 +1), 요약 문구 "5v5 가능 (휴식 N명)" 정확
- [ ] 미투표 목록에 투표 안 한 멤버가 모두 표시되고, `is_late` 투표자에 "지각" 배지
- [ ] `index.html?demo=1`의 "이번 주 투표" 카드에 "참석 N명 · 마감 …" 요약과 링크
- [ ] `node scripts/housekeeping.js --dry-run` 이 시크릿 없이 계획을 출력하고 종료코드 0 (네트워크 없이 — 시크릿 없으면 조회도 건너뛰고 "조회 생략" 표기)
- [ ] `cron.yml`에 housekeeping 스텝이 scrape 실패와 무관하게 실행되도록 추가됨
- [ ] 375px에서 vote.html 가로 넘침 없음
- [ ] 실제 Supabase 경로(투표 저장·RLS·cron 실제 실행)는 Claude가 검증 (PR에 "미검증" 명시)

## 테스트 방법
- 자동: `npm test`
- 수동: `python -m http.server 8765` → `/vote.html?demo=1`, `/index.html?demo=1`

## 참고
- `js/supabase.js`의 `ExicanAuth`, `js/ui.js`의 `showToast`·`escapeHtml`·`formatWon`, `js/config.js`의 `FINES`·`DUES_MONTHLY`·`INJURY_EXEMPT_RATE`
- `scripts/scrape-cafe.js`의 `upsertCandidates`에 쓰인 PostgREST 호출 방식 참고(복사하지 말고 `scripts/lib/rest.js`로 일반화)
- `supabase/schema.sql`의 `ledger` 부분 unique index 정의
